import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { AgentEvent, Conversation, ConversationStatus, NewConversation, NewTicket, TicketEvent, TicketProposal, User } from '@studio/shared'
import * as claude from './agents/claude.ts'
import * as codex from './agents/codex.ts'
import { agentStatus, claudeEnv, codexEnv, gitEnv } from './connections.ts'
import { CONTAINERS, containerName, homeMounts, taskMounts } from './containers.ts'
import { DATA_DIR, db } from './db.ts'
import * as g from './git.ts'
import { HttpError } from './http-error.ts'
import { updateImprovement } from './improvements.ts'
import { BRIDGE, SERVER, serveTools, type ToolServer } from './studio-tools.ts'
import { createTicket, emit, linkContext } from './tickets.ts'
import { workspaceRepos, workspaceRoot } from './workspaces.ts'

const DIR = path.join(DATA_DIR, 'conversations')
// A lista vem do agente (agentModels); aqui só barra o que não parece nome de modelo.
const MODEL_ID = /^[\w.[\]-]+$/

type Row = {
  id: string
  workspace_id: string
  title: string
  agent: 'claude' | 'codex'
  model: string
  status: ConversationStatus
  session_id: string | null
  dir: string
  created_by: string
  author: string | null
  created_at: string
}

const toConversation = (r: Row): Conversation => ({
  id: r.id,
  workspaceId: r.workspace_id,
  title: r.title,
  agent: r.agent,
  model: r.model,
  status: r.status,
  authorId: r.created_by,
  author: r.author,
  createdAt: r.created_at,
})

const SELECT = 'SELECT c.*, u.name AS author FROM conversations c LEFT JOIN users u ON u.id = c.created_by'

db.prepare("UPDATE conversations SET status = 'interrupted' WHERE status = 'running'").run()

const sessions = new Map<string, claude.Session>()
const stopping = new Set<string>()
// Mensagens que chegaram enquanto a sessão encerrava; viram a próxima pergunta logo em seguida.
const pending = new Map<string, string[]>()
const resolving = new Set<string>()

function getRow(id: string): Row {
  const row = db.prepare(`${SELECT} WHERE c.id = ?`).get(id) as Row | undefined
  if (!row) throw new HttpError(404, 'Conversa não encontrada')
  return row
}

export function listConversations(workspaceId: string): Conversation[] {
  return (db.prepare(`${SELECT} WHERE c.workspace_id = ? ORDER BY c.num DESC`).all(workspaceId) as Row[]).map(toConversation)
}

export function getConversation(id: string): Conversation {
  return toConversation(getRow(id))
}

export function listEvents(id: string): TicketEvent[] {
  const rows = db.prepare('SELECT seq, at, data FROM conversation_events WHERE conversation_id = ? ORDER BY seq').all(id) as { seq: number; at: string; data: string }[]
  return rows.map((r) => ({ seq: r.seq, at: r.at, event: JSON.parse(r.data) }))
}

function record(id: string, event: AgentEvent) {
  const seq = ((db.prepare('SELECT MAX(seq) AS n FROM conversation_events WHERE conversation_id = ?').get(id) as { n: number | null }).n ?? 0) + 1
  const at = new Date().toISOString()
  db.prepare('INSERT INTO conversation_events (conversation_id, seq, at, data) VALUES (?, ?, ?, ?)').run(id, seq, at, JSON.stringify(event))
  emit(id, { kind: 'event', event: { seq, at, event } })
}

function setStatus(id: string, status: ConversationStatus, sessionId?: string) {
  if (sessionId) db.prepare('UPDATE conversations SET session_id = ? WHERE id = ?').run(sessionId, id)
  db.prepare('UPDATE conversations SET status = ? WHERE id = ?').run(status, id)
  emit(id, { kind: 'conversation', conversation: getConversation(id) })
}

export async function createConversation(workspaceId: string, input: NewConversation, user: User): Promise<Conversation> {
  const root = workspaceRoot(workspaceId)
  const text = input.text?.trim()
  if (!text) throw new HttpError(400, 'Escreva a mensagem')
  const agent = input.agent ?? 'claude'
  if (agent !== 'claude' && agent !== 'codex') throw new HttpError(400, 'Agente inválido')
  const model = agent === 'codex' ? (input.model ?? '').trim() : input.model
  if ((agent === 'claude' || model) && !MODEL_ID.test(model ?? '')) throw new HttpError(400, 'Modelo inválido')
  if (!(await agentStatus(user, agent)).connected) throw new HttpError(400, `Conecte o ${agent === 'codex' ? 'Codex' : 'Claude Code'} na tela Conexões antes de conversar`)

  const id = randomUUID()
  const dir = path.join(DIR, id)
  fs.mkdirSync(dir, { recursive: true })
  linkContext(root, dir, workspaceRepos(workspaceId).map((r) => r.name))
  const title = text.split('\n')[0].slice(0, 80)
  db.prepare("INSERT INTO conversations (id, workspace_id, title, agent, model, status, dir, created_by) VALUES (?, ?, ?, ?, ?, 'running', ?, ?)").run(
    id,
    workspaceId,
    title,
    agent,
    model,
    dir,
    user.id,
  )
  record(id, { type: 'user', text })
  run(getRow(id), text)
  return getConversation(id)
}

// Cada repo entra como worktree destacada na branch base atualizada do origin, sem arquivos fora do
// git (.env, node_modules). Atualiza a cada pergunta, e repos acrescentados depois também entram.
async function syncRepos(r: Row) {
  const root = workspaceRoot(r.workspace_id)
  const present = workspaceRepos(r.workspace_id).filter((repo) => fs.existsSync(path.join(root, repo.name, '.git')))
  let env: Record<string, string> = {}
  try {
    env = gitEnv(owner(r))
  } catch {}
  for (const repo of present) {
    const wt = path.join(r.dir, repo.name)
    const { ref } = await g.freshBase(path.join(root, repo.name), repo.defaultBranch, env)
    if (fs.existsSync(wt)) await g.git(wt, ['checkout', '-q', '--detach', ref]).catch(() => {})
    else await g.git(path.join(root, repo.name), ['worktree', 'add', '-q', '--detach', wt, ref])
  }
  return present
}

function owner(r: Row) {
  const u = db.prepare('SELECT id, admin FROM users WHERE id = ?').get(r.created_by) as { id: string; admin: number }
  return { id: u.id, admin: !!u.admin }
}

async function run(r: Row, prompt: string) {
  setStatus(r.id, 'running')
  let ok = false
  let session: claude.Session
  let tools: ToolServer | undefined
  try {
    const repos = await syncRepos(r)
    const instructions = [
      'Você está conversando sobre este workspace no modo Conversar do david the studio.',
      `Os repositórios são as subpastas ${repos.map((repo) => `${repo.name}/ (branch ${repo.defaultBranch})`).join(', ')} da pasta atual.`,
      'Não edite arquivos, não crie arquivos e não rode comandos que mudem algo. Responda com base no código e no contexto do workspace.',
      `As únicas ações permitidas são as ferramentas do servidor "${SERVER}": manter a lista de melhorias do workspace (listar, criar, editar, apagar) e propor tickets.`,
      'Quando a pessoa pedir um ticket, use propor_ticket: ele mostra um cartão que a pessoa revisa e confirma; não diga que o ticket foi criado.',
      'Para citar uma melhoria existente, pegue o id em listar_melhorias; nunca invente ids.',
    ].join('\n')
    tools = await serveTools(r.id, {
      workspaceId: r.workspace_id,
      userId: r.created_by,
      onProposal: (proposal) => record(r.id, { type: 'proposal', id: randomUUID(), proposal }),
    })
    // Dentro do container o node é o da imagem; a ponte e o socket entram montados no mesmo caminho.
    const mcp = { command: CONTAINERS ? 'node' : process.execPath, args: [BRIDGE, tools.socket] }
    const common = {
      cwd: r.dir,
      prompt,
      model: r.model,
      instructions,
      resume: r.session_id,
      readOnly: true,
      mcp,
      onEvent: (e: AgentEvent) => {
        if (e.type === 'result' && stopping.has(r.id)) e = { ...e, ok: false, error: 'parado por você' }
        record(r.id, e)
        if (e.type === 'start') setStatus(r.id, 'running', e.sessionId)
        if (e.type === 'result') ok = e.ok
      },
    }
    const env = r.agent === 'codex' ? codexEnv(owner(r)) : claudeEnv(owner(r))
    const names = repos.map((repo) => repo.name)
    const container = CONTAINERS
      ? {
          name: containerName('conv', r.id),
          mounts: [
            ...taskMounts(r.dir, names, workspaceRoot(r.workspace_id), false),
            ...homeMounts(env),
            { path: BRIDGE, readOnly: true },
            { path: tools.socket },
          ],
        }
      : undefined
    session =
      r.agent === 'codex'
        ? codex.start({ ...common, env, container, secretDirs: [workspaceRoot(r.workspace_id), r.dir] })
        : claude.start({ ...common, env, container })
  } catch (err) {
    tools?.close()
    record(r.id, { type: 'result', ok: false, durationMs: 0, turns: 0, error: String((err as Error)?.message ?? err) })
    return setStatus(r.id, 'error')
  }
  sessions.set(r.id, session)
  session.done
    .catch((err) => {
      if (!stopping.has(r.id)) record(r.id, { type: 'result', ok: false, durationMs: 0, turns: 0, error: String(err?.message ?? err) })
      ok = false
    })
    .then(() => {
      tools?.close()
      sessions.delete(r.id)
      const next = pending.get(r.id)
      pending.delete(r.id)
      if (stopping.delete(r.id)) return setStatus(r.id, 'interrupted')
      if (next) return run(getRow(r.id), next.join('\n\n'))
      setStatus(r.id, ok ? 'idle' : 'error')
    })
}

// A sessão do agente fica no login de quem abriu a conversa; outra pessoa continuar usaria a conta dele.
function assertAuthor(r: Row, user: User) {
  if (r.created_by !== user.id) throw new HttpError(403, 'Só quem abriu a conversa pode continuar')
}

export function sendMessage(id: string, input: string, user: User) {
  const text = input?.trim()
  if (!text) throw new HttpError(400, 'Mensagem vazia')
  const r = getRow(id)
  assertAuthor(r, user)
  const s = sessions.get(id)
  if (s && stopping.has(id)) throw new HttpError(409, 'O agente está parando; mande de novo em instantes')
  record(id, { type: 'user', text })
  if (s?.send(text)) return
  if (s) pending.set(id, [...(pending.get(id) ?? []), text])
  else run(r, text)
}

// Cartão de ticket proposto pelo agente: cria (input) ou descarta (null). Uma vez só por proposta.
export async function resolveProposal(id: string, proposalId: string, input: NewTicket | null, user: User): Promise<string | null> {
  const r = getRow(id)
  if (r.created_by !== user.id) throw new HttpError(403, 'Só quem abriu a conversa pode criar o ticket')
  const events = listEvents(id).map((e) => e.event)
  const proposal = events.find((e): e is { type: 'proposal'; id: string; proposal: TicketProposal } => e.type === 'proposal' && e.id === proposalId)
  if (!proposal) throw new HttpError(404, 'Proposta não encontrada')
  if (events.some((e) => e.type === 'proposal_done' && e.id === proposalId) || resolving.has(proposalId)) throw new HttpError(409, 'Esta proposta já foi resolvida')
  if (!input) {
    record(id, { type: 'proposal_done', id: proposalId })
    return null
  }
  // createTicket é assíncrono; a trava evita dois cliques criarem dois tickets.
  resolving.add(proposalId)
  try {
    const ticket = await createTicket(r.workspace_id, input, user)
    const improvementId = proposal.proposal.improvementId
    if (improvementId) {
      try {
        updateImprovement(r.workspace_id, improvementId, { status: 'ticket', ticketId: ticket.id })
      } catch {}
    }
    record(id, { type: 'proposal_done', id: proposalId, ticketId: ticket.id })
    return ticket.id
  } finally {
    resolving.delete(proposalId)
  }
}

export async function stopConversation(id: string) {
  getRow(id)
  const s = sessions.get(id)
  if (!s) throw new HttpError(409, 'O agente não está rodando')
  stopping.add(id)
  pending.delete(id)
  await s.stop()
}

export async function deleteConversation(id: string, user?: User) {
  const r = getRow(id)
  if (user && r.created_by !== user.id && !user.admin) throw new HttpError(403, 'Só quem abriu a conversa ou o administrador pode apagar')
  if (sessions.has(id)) throw new HttpError(409, 'Pare o agente antes de apagar')
  const root = workspaceRoot(r.workspace_id)
  for (const repo of workspaceRepos(r.workspace_id)) await g.removeWorktree(path.join(root, repo.name), path.join(r.dir, repo.name))
  fs.rmSync(r.dir, { recursive: true, force: true })
  db.prepare('DELETE FROM conversation_events WHERE conversation_id = ?').run(id)
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

export async function deleteConversations(workspaceId: string) {
  for (const c of listConversations(workspaceId)) await deleteConversation(c.id)
}
