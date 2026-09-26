import path from 'node:path'
import { query, type HookCallback, type Options, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { AgentEvent, Ask, Question, Reply } from '@studio/shared'
import { forwardKeys, spawnInContainer, type Mount } from '../containers.ts'

const MAX_OUTPUT = 4000

type StartOptions = {
  cwd: string
  prompt: string
  model: string
  instructions: string
  resume?: string | null
  // Se definido, edições de arquivo fora desta pasta são recusadas.
  writableDir?: string
  // Pastas fora do cwd que o agente acessa sem pedir permissão.
  extraDirs?: string[]
  // Só leitura (modo Perguntar): ferramentas que pedem permissão são recusadas sem ir à tela.
  readOnly?: boolean
  // Ambiente completo do processo (login do usuário); ausente herda o do daemon.
  env?: Record<string, string>
  // Roda o agente num container com só estas pastas montadas.
  container?: { name: string; mounts: Mount[] }
  onEvent: (e: AgentEvent) => void
  // Pergunta ou pedido de permissão: o agente fica parado até a promessa resolver.
  onAsk?: (id: string, ask: Ask, signal: AbortSignal) => Promise<Reply>
}

export type Session = {
  // false quando a sessão já está encerrando; aí quem chamou retoma com resume.
  send: (text: string) => boolean
  stop: () => Promise<void>
  done: Promise<void>
}

export function start(o: StartOptions): Session {
  const queue: string[] = []
  let sent = 0
  let ended = 0
  let wake = () => {}
  let closed = false
  const endTurn = () => {
    ended++
    wake()
  }

  // Uma mensagem por turno: a próxima entra quando o turno atual termina; fila vazia encerra a sessão.
  async function* input(): AsyncGenerator<SDKUserMessage> {
    let text: string | undefined = o.prompt
    while (text !== undefined) {
      yield { type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null }
      sent++
      while (!closed && ended < sent) await new Promise<void>((r) => (wake = r))
      text = closed ? undefined : queue.shift()
    }
    closed = true
  }

  const q = query({
    prompt: input(),
    options: {
      cwd: o.cwd,
      model: o.model,
      resume: o.resume ?? undefined,
      additionalDirectories: o.extraDirs,
      env: o.env,
      spawnClaudeCodeProcess: o.container && inContainer(o.container, o.cwd),
      // Edições dentro da pasta da tarefa passam; o resto vira pedido de permissão na tela.
      permissionMode: o.readOnly ? 'default' : 'acceptEdits',
      systemPrompt: { type: 'preset', preset: 'claude_code', append: o.instructions },
      hooks: o.writableDir ? { PreToolUse: [{ matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [onlyInside(o.cwd, o.writableDir)] }] } : undefined,
      canUseTool: async (tool, toolInput, { signal, toolUseID }) => {
        if (o.readOnly) return { behavior: 'deny', message: 'Nesta conversa o agente só lê: não edita arquivos nem roda comandos que mudem algo. Se precisar perguntar, pergunte na resposta.' }
        const ask: Ask =
          tool === 'AskUserQuestion'
            ? { kind: 'question', questions: questionsOf(toolInput) }
            : { kind: 'permission', tool, title: `O agente quer usar ${tool}`, detail: detailOf(toolInput) }
        const reply = await o.onAsk!(toolUseID, ask, signal)
        if (!reply.allow) return { behavior: 'deny', message: 'O usuário recusou pela tela do david the studio.' }
        return { behavior: 'allow', updatedInput: reply.answers ? { ...toolInput, answers: reply.answers } : toolInput }
      },
    },
  })

  const done = (async () => {
    for await (const m of q) {
      for (const e of translate(m)) o.onEvent(e)
      if (m.type === 'result') endTurn()
    }
  })()

  return {
    send(text) {
      if (closed) return false
      queue.push(text)
      return true
    },
    async stop() {
      closed = true
      queue.length = 0
      await q.interrupt().catch(() => {})
      wake()
      // Se o processo não sair sozinho depois do interrupt, encerra à força.
      setTimeout(() => q.close(), 5000).unref()
    },
    done,
  }
}

// Os args do SDK valem para o binário nativo, que no container é o `claude` da imagem.
function inContainer(c: { name: string; mounts: Mount[] }, cwd: string): NonNullable<Options['spawnClaudeCodeProcess']> {
  return (s) => {
    const env = s.env as Record<string, string>
    const child = spawnInContainer({ name: c.name, cwd: s.cwd ?? cwd, mounts: c.mounts, command: 'claude', args: s.args, env, envKeys: forwardKeys(env) })
    s.signal.addEventListener('abort', () => child.kill(), { once: true })
    return child
  }
}

// Hook e não canUseTool: no modo acceptEdits as edições na pasta passam sem consultar o canUseTool.
function onlyInside(cwd: string, dir: string): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== 'PreToolUse') return {}
    const ti = input.tool_input as { file_path?: string; notebook_path?: string }
    const file = path.resolve(cwd, ti.file_path ?? ti.notebook_path ?? '')
    if (file.startsWith(path.resolve(dir) + path.sep)) return {}
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Nesta etapa só é permitido editar arquivos em ${dir}. O código muda só depois do plano aprovado.`,
      },
    }
  }
}

function questionsOf(input: Record<string, unknown>): Question[] {
  const qs = (input.questions ?? []) as Question[]
  return qs.map((q) => ({
    question: q.question,
    header: q.header,
    multiSelect: !!q.multiSelect,
    options: q.options.map((op) => ({ label: op.label, description: op.description })),
  }))
}

function detailOf(input: Record<string, unknown>): string {
  for (const k of ['command', 'file_path', 'url', 'pattern']) if (typeof input[k] === 'string') return input[k] as string
  return JSON.stringify(input).slice(0, MAX_OUTPUT)
}

function translate(m: SDKMessage): AgentEvent[] {
  if (m.type === 'system' && m.subtype === 'init') return [{ type: 'start', sessionId: m.session_id, model: m.model }]
  if (m.type === 'assistant') {
    return m.message.content.flatMap((b): AgentEvent[] => {
      if (b.type === 'text' && b.text.trim()) return [{ type: 'text', text: b.text }]
      if (b.type === 'tool_use') return [{ type: 'tool', id: b.id, name: b.name, input: b.input as Record<string, unknown> }]
      return []
    })
  }
  if (m.type === 'user' && Array.isArray(m.message.content)) {
    return m.message.content.flatMap((b): AgentEvent[] =>
      b.type === 'tool_result'
        ? [{ type: 'tool_result', id: b.tool_use_id, error: !!b.is_error, output: textOf(b.content).slice(0, MAX_OUTPUT) }]
        : [],
    )
  }
  if (m.type === 'result') {
    return [
      {
        type: 'result',
        ok: m.subtype === 'success' && !m.is_error,
        costUsd: m.total_cost_usd,
        durationMs: m.duration_ms,
        turns: m.num_turns,
        error: m.subtype === 'success' ? undefined : m.errors.join('\n') || m.subtype,
      },
    ]
  }
  return []
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((c) => (c?.type === 'text' ? c.text : '')).join('\n')
  return ''
}
