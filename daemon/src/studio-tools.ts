import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ImprovementStatus, TicketProposal } from '@studio/shared'
import { RUN_DIR } from './containers.ts'
import { HttpError } from './http-error.ts'
import { createImprovement, deleteImprovement, listImprovements, updateImprovement } from './improvements.ts'
import { workspaceRepos } from './workspaces.ts'

// Ferramentas que o agente do modo Conversar pode usar. Um socket por conversa: o escopo
// (workspace, quem registra a proposta) vem do próprio socket, não do que o agente manda.
export const SERVER = 'studio'
export const BRIDGE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mcp-bridge.mjs')

type Ctx = { workspaceId: string; userId: string; onProposal: (p: TicketProposal) => void }
type Args = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
const STATUS_LABEL: Record<ImprovementStatus, string> = { open: 'aberta', ticket: 'em ticket', done: 'feita' }
const STATUS_OF: Record<string, ImprovementStatus> = { aberta: 'open', 'em ticket': 'ticket', feita: 'done', open: 'open', ticket: 'ticket', done: 'done' }

function status(v: unknown): ImprovementStatus | undefined {
  if (v === undefined) return undefined
  const s = STATUS_OF[String(v).toLowerCase()]
  if (!s) throw new HttpError(400, 'Status inválido: use aberta, em ticket ou feita')
  return s
}

const TOOLS: { name: string; description: string; inputSchema: object; run: (a: Args, c: Ctx) => string }[] = [
  {
    name: 'listar_melhorias',
    description: 'Lista as melhorias do workspace (id, título, status, ticket ligado e descrição).',
    inputSchema: { type: 'object', properties: {} },
    run: (_a, c) => {
      const items = listImprovements(c.workspaceId)
      if (!items.length) return 'Nenhuma melhoria cadastrada.'
      return items.map((i) => `- id ${i.id} · ${STATUS_LABEL[i.status]}${i.ticketId ? ` (${i.ticketId})` : ''}\n  ${i.title}\n  ${i.description.replace(/\n/g, '\n  ')}`).join('\n')
    },
  },
  {
    name: 'criar_melhoria',
    description: 'Cria uma melhoria na lista do workspace. Começa como aberta.',
    inputSchema: {
      type: 'object',
      properties: { titulo: { type: 'string' }, descricao: { type: 'string', description: 'Markdown; pode ficar vazia.' } },
      required: ['titulo'],
    },
    run: (a, c) => {
      const i = createImprovement(c.workspaceId, { title: str(a.titulo) ?? '', description: str(a.descricao) }, c.userId)
      return `Melhoria criada: id ${i.id} · ${i.title}`
    },
  },
  {
    name: 'editar_melhoria',
    description: 'Edita uma melhoria. Mande só os campos que mudam. Status: aberta, em ticket ou feita.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        titulo: { type: 'string' },
        descricao: { type: 'string' },
        status: { type: 'string', enum: ['aberta', 'em ticket', 'feita'] },
      },
      required: ['id'],
    },
    run: (a, c) => {
      const i = updateImprovement(c.workspaceId, str(a.id) ?? '', { title: str(a.titulo), description: str(a.descricao), status: status(a.status) })
      return `Melhoria atualizada: id ${i.id} · ${STATUS_LABEL[i.status]} · ${i.title}`
    },
  },
  {
    name: 'apagar_melhoria',
    description: 'Apaga uma melhoria da lista.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: (a, c) => {
      deleteImprovement(c.workspaceId, str(a.id) ?? '')
      return 'Melhoria apagada.'
    },
  },
  {
    name: 'propor_ticket',
    description:
      'Propõe um ticket. Não cria: a conversa mostra um cartão preenchido que a pessoa ajusta e confirma. ' +
      'repos vazio deixa o agente do ticket escolher na spec. Se o ticket vem de uma melhoria, mande o id dela (veja listar_melhorias).',
    inputSchema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        descricao: { type: 'string', description: 'O que o agente do ticket deve fazer, em Markdown.' },
        repos: { type: 'array', items: { type: 'string' } },
        melhoria_id: { type: 'string' },
      },
      required: ['titulo', 'descricao'],
    },
    run: (a, c) => {
      const title = str(a.titulo)?.trim()
      if (!title) throw new HttpError(400, 'Dê um título ao ticket')
      const names = workspaceRepos(c.workspaceId).map((r) => r.name)
      const repos = Array.isArray(a.repos) ? [...new Set(a.repos.map(String))] : []
      const unknown = repos.filter((r) => !names.includes(r))
      if (unknown.length) throw new HttpError(400, `Repositórios que não existem no workspace: ${unknown.join(', ')}. Existem: ${names.join(', ')}`)
      const improvementId = str(a.melhoria_id) || undefined
      if (improvementId && !listImprovements(c.workspaceId).some((i) => i.id === improvementId)) throw new HttpError(404, 'Melhoria não encontrada')
      c.onProposal({ title, description: str(a.descricao)?.trim() ?? '', repos, improvementId })
      return 'Cartão do ticket mostrado na conversa. A pessoa revisa e cria pela tela; o ticket ainda não existe.'
    },
  },
]

type Message = { jsonrpc: '2.0'; id?: number | string; method?: string; params?: Record<string, unknown> }

function handle(m: Message, c: Ctx): unknown {
  switch (m.method) {
    case 'initialize':
      return { protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: SERVER, version: '1.0.0' } }
    case 'ping':
      return {}
    case 'tools/list':
      return { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) }
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === m.params?.name)
      if (!tool) return { content: [{ type: 'text', text: `Ferramenta desconhecida: ${m.params?.name}` }], isError: true }
      try {
        return { content: [{ type: 'text', text: tool.run((m.params?.arguments ?? {}) as Args, c) }] }
      } catch (err) {
        return { content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }], isError: true }
      }
    }
    default:
      throw Object.assign(new Error(`Método não suportado: ${m.method}`), { code: -32601 })
  }
}

export type ToolServer = { socket: string; dir: string; close: () => void }

export async function serveTools(conversationId: string, ctx: Ctx): Promise<ToolServer> {
  // Uma pasta por conversa: é ela que entra no container do agente, sem expor os sockets das outras.
  const dir = path.join(RUN_DIR, `mcp-${conversationId}`)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const socket = path.join(dir, 'tools.sock')
  const server = net.createServer((conn) => {
    let buf = ''
    conn.setEncoding('utf8')
    conn.on('error', () => {})
    conn.on('data', (chunk) => {
      buf += chunk
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        let m: Message
        try {
          m = JSON.parse(line)
        } catch {
          conn.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }) + '\n')
          continue
        }
        // Sem id é notificação (ex.: notifications/initialized): não tem resposta.
        if (m.id === undefined) continue
        let reply: object
        try {
          reply = { jsonrpc: '2.0', id: m.id, result: handle(m, ctx) }
        } catch (err) {
          const e = err as { code?: number; message?: string }
          reply = { jsonrpc: '2.0', id: m.id, error: { code: e.code ?? -32603, message: e.message ?? 'Erro' } }
        }
        conn.write(JSON.stringify(reply) + '\n')
      }
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(socket, () => resolve())
  })
  return {
    socket,
    dir,
    close: () => {
      server.close()
      fs.rmSync(dir, { recursive: true, force: true })
    },
  }
}
