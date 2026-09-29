import { Codex, type ThreadEvent, type ThreadItem } from '@openai/codex-sdk'
import type { AgentEvent, Prompt } from '@studio/shared'
import { codexLauncher, forwardKeys, removeContainer, type Mount } from '../containers.ts'
import { imagePath } from '../images.ts'
import { SERVER } from '../studio-tools.ts'
import type { Session } from './claude.ts'

const MAX_OUTPUT = 4000
const SECRETS = ['**/.env*', '**/*.pem', '**/*.key', '**/id_rsa*', '**/id_ed25519*']

type StartOptions = {
  cwd: string
  prompt: Prompt
  // Vazio usa o modelo padrão da conta.
  model: string
  instructions: string
  resume?: string | null
  // Se definido, só esta pasta é gravável (etapas de spec e plano).
  writableDir?: string
  // Nada gravável (modo Conversar).
  readOnly?: boolean
  // Servidor MCP stdio com as ferramentas do studio (criar melhoria, propor ticket).
  mcp?: { command: string; args: string[] }
  // Pastas onde .env, chaves e afins ficam ilegíveis para o agente.
  secretDirs: string[]
  // Ambiente completo do processo (CODEX_HOME do usuário); ausente herda o do daemon.
  env?: Record<string, string>
  // Roda o agente num container com só estas pastas montadas.
  container?: { name: string; mounts: Mount[] }
  onEvent: (e: AgentEvent) => void
}

// O Codex não pede permissão: roda sem aprovação dentro de um perfil de sandbox que limita
// escrita à pasta da tarefa (ou só a writableDir) e esconde os segredos.
export function start(o: StartOptions): Session {
  const profile = o.readOnly ? 'studio_read' : o.writableDir ? 'studio_doc' : 'studio'
  const rules = [
    'glob_scan_max_depth=4',
    ...(o.writableDir ? [`${JSON.stringify(o.writableDir)}="write"`] : []),
    ...o.secretDirs.map((d) => `${JSON.stringify(d)}={${SECRETS.map((s) => `${JSON.stringify(s)}="deny"`).join(', ')}}`),
  ]
  // Sem sandboxMode na thread: passar um modo explícito descarta o perfil de permissões.
  // O SDK acrescenta estas chaves ao ambiente do processo; o container recebe só as do agente.
  const keys = [...new Set([...forwardKeys(o.env ?? {}), 'CODEX_API_KEY', 'OPENAI_API_KEY', 'CODEX_INTERNAL_ORIGINATOR_OVERRIDE'])]
  const codex = new Codex({
    env: o.env,
    codexPathOverride: o.container && codexLauncher(o.container.name, o.cwd, o.container.mounts, keys),
    config: {
      developer_instructions: o.instructions,
      default_permissions: profile,
      permissions: { [profile]: { extends: o.readOnly || o.writableDir ? ':read-only' : ':workspace', network: { enabled: true } } },
      // approve: com approvalPolicy never, ferramenta que pedisse aprovação seria recusada.
      ...(o.mcp && { mcp_servers: { [SERVER]: { command: o.mcp.command, args: o.mcp.args, default_tools_approval_mode: 'approve' } } }),
    },
    // Chaves que são caminhos precisam ir como tabela inline; o SDK não põe aspas em chaves pontuadas.
    configOverrides: [`permissions.${profile}.filesystem={${rules.join(', ')}}`],
  })
  const opts = { workingDirectory: o.cwd, model: o.model || undefined, approvalPolicy: 'never' as const, skipGitRepoCheck: true }
  const thread = o.resume ? codex.resumeThread(o.resume, opts) : codex.startThread(opts)

  const queue: Prompt[] = []
  let closed = false
  const abort = new AbortController()

  // Uma mensagem por turno, como no adaptador do Claude; fila vazia encerra a sessão.
  const done = (async () => {
    let next: Prompt | undefined = o.prompt
    while (next !== undefined && !closed) {
      const began = Date.now()
      let failed = false
      try {
        const { events } = await thread.runStreamed(inputOf(next), { signal: abort.signal })
        for await (const e of events) {
          for (const ev of translate(e, o.model, began)) o.onEvent(ev)
          if (e.type === 'turn.failed') failed = true
        }
      } catch (err) {
        // Depois de um turn.failed o processo sai com erro; a falha já foi registrada.
        if (!closed && !failed) throw err
      }
      if (failed) break
      next = queue.shift()
    }
    closed = true
  })()

  return {
    send(prompt) {
      if (closed) return false
      queue.push(prompt)
      return true
    },
    async stop() {
      closed = true
      queue.length = 0
      abort.abort()
      if (o.container) await removeContainer(o.container.name)
    },
    done,
  }
}

// O Codex lê a imagem pelo caminho; no container a pasta de imagens entra montada no mesmo caminho.
function inputOf(p: Prompt) {
  if (!p.images.length) return p.text
  return [{ type: 'text' as const, text: p.text }, ...p.images.map((id) => ({ type: 'local_image' as const, path: imagePath(id) }))]
}

function translate(e: ThreadEvent, model: string, began: number): AgentEvent[] {
  if (e.type === 'thread.started') return [{ type: 'start', sessionId: e.thread_id, model }]
  if (e.type === 'item.started') return started(e.item)
  if (e.type === 'item.completed') return completed(e.item)
  if (e.type === 'turn.completed') {
    const tokens = e.usage.input_tokens + e.usage.output_tokens
    return [{ type: 'result', ok: true, tokens, durationMs: Date.now() - began, turns: 1 }]
  }
  if (e.type === 'turn.failed') return [{ type: 'result', ok: false, durationMs: Date.now() - began, turns: 1, error: e.error.message }]
  return []
}

function started(item: ThreadItem): AgentEvent[] {
  if (item.type === 'command_execution') return [{ type: 'tool', id: item.id, name: 'Shell', input: { command: unwrap(item.command) } }]
  if (item.type === 'mcp_tool_call') return [{ type: 'tool', id: item.id, name: `${item.server}.${item.tool}`, input: (item.arguments ?? {}) as Record<string, unknown> }]
  return []
}

function completed(item: ThreadItem): AgentEvent[] {
  switch (item.type) {
    case 'agent_message':
      return item.text.trim() ? [{ type: 'text', text: item.text }] : []
    case 'command_execution':
      return [{ type: 'tool_result', id: item.id, error: item.status !== 'completed' || item.exit_code !== 0, output: item.aggregated_output.slice(-MAX_OUTPUT) }]
    case 'mcp_tool_call': {
      const output = item.error?.message ?? JSON.stringify(item.result?.content ?? '').slice(0, MAX_OUTPUT)
      return [{ type: 'tool_result', id: item.id, error: item.status !== 'completed', output }]
    }
    case 'file_change':
      // O Codex só avisa da edição depois de aplicada; vira ferramenta e resultado juntos.
      return [
        { type: 'tool', id: item.id, name: 'Edit', input: { file_path: item.changes.map((c) => c.path).join(', ') } },
        { type: 'tool_result', id: item.id, error: item.status !== 'completed', output: item.changes.map((c) => `${c.kind} ${c.path}`).join('\n') },
      ]
    case 'web_search':
      return [{ type: 'tool', id: item.id, name: 'WebSearch', input: { query: item.query } }]
    case 'error':
      return [{ type: 'text', text: `Aviso do Codex: ${item.message}` }]
    default:
      return []
  }
}

// O Codex roda tudo como /bin/zsh -lc '<comando>'; no log basta o comando.
function unwrap(command: string) {
  const m = command.match(/^\/bin\/(?:ba|z)?sh -lc (['"])([\s\S]*)\1$/)
  return m ? m[2] : command
}
