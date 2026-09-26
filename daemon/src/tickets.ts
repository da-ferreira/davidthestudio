import fs from 'node:fs'
import path from 'node:path'
import type { AgentEvent, NewTicket, Ticket, TicketDetail, TicketEvent, TicketStatus, WsMessage } from '@studio/shared'
import * as claude from './agents/claude.ts'
import { DATA_DIR, db } from './db.ts'
import * as g from './git.ts'
import { HttpError } from './http-error.ts'
import { workspaceRepos, workspaceRoot } from './workspaces.ts'

const TASKS_DIR = path.join(DATA_DIR, 'tasks')
const MODELS = ['opus', 'sonnet', 'haiku']
// Fora da pasta da tarefa: segredos não vão para o contexto do agente.
const SECRET = /^\.env|\.pem$|\.key$|^id_rsa|^id_ed25519/

type Row = {
  id: string
  workspace_id: string
  title: string
  description: string
  repos: string
  model: string
  status: TicketStatus
  branch: string
  task_dir: string
  session_id: string | null
  created_at: string
}

const toTicket = (r: Row): Ticket => ({
  id: r.id,
  workspaceId: r.workspace_id,
  title: r.title,
  description: r.description,
  repos: JSON.parse(r.repos),
  model: r.model,
  status: r.status,
  branch: r.branch,
  taskDir: r.task_dir,
  sessionId: r.session_id,
  createdAt: r.created_at,
})

const listeners = new Map<string, Set<(m: WsMessage) => void>>()

export function subscribe(id: string, fn: (m: WsMessage) => void): () => void {
  if (!listeners.has(id)) listeners.set(id, new Set())
  listeners.get(id)!.add(fn)
  return () => listeners.get(id)?.delete(fn)
}

function emit(id: string, m: WsMessage) {
  for (const fn of listeners.get(id) ?? []) fn(m)
}

// O daemon caiu no meio de uma execução: o processo do agente morreu junto.
db.prepare("UPDATE tickets SET status = 'interrupted' WHERE status = 'running'").run()

function getRow(id: string): Row {
  const row = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as Row | undefined
  if (!row) throw new HttpError(404, 'Ticket não encontrado')
  return row
}

export function listTickets(workspaceId: string): Ticket[] {
  const rows = db.prepare('SELECT * FROM tickets WHERE workspace_id = ? ORDER BY num DESC').all(workspaceId) as Row[]
  return rows.map(toTicket)
}

export function getTicket(id: string): Ticket {
  return toTicket(getRow(id))
}

export function listEvents(id: string): TicketEvent[] {
  const rows = db.prepare('SELECT seq, at, data FROM events WHERE ticket_id = ? ORDER BY seq').all(id) as {
    seq: number
    at: string
    data: string
  }[]
  return rows.map((r) => ({ seq: r.seq, at: r.at, event: JSON.parse(r.data) }))
}

export function getTicketDetail(id: string): TicketDetail {
  return { ...getTicket(id), events: listEvents(id) }
}

// Tickets cuja worktree desse repo ainda existe (a worktree some ao concluir ou descartar).
export function ticketsUsingRepo(workspaceId: string, repo: string): string[] {
  return listTickets(workspaceId)
    .filter((t) => t.repos.includes(repo) && fs.existsSync(path.join(t.taskDir, repo)))
    .map((t) => t.id)
}

function slugify(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '')
}

export async function createTicket(workspaceId: string, input: NewTicket): Promise<Ticket> {
  const root = workspaceRoot(workspaceId)
  const manifestRepos = workspaceRepos(workspaceId)
  const title = input.title?.trim()
  if (!title) throw new HttpError(400, 'Dê um título ao ticket')
  if (!MODELS.includes(input.model)) throw new HttpError(400, 'Modelo inválido')
  const repos = [...new Set(input.repos ?? [])]
  if (!repos.length) throw new HttpError(400, 'Escolha ao menos um repositório')
  for (const name of repos) {
    const repo = manifestRepos.find((r) => r.name === name)
    if (!repo || !fs.existsSync(path.join(root, name, '.git'))) throw new HttpError(400, `Repositório ${name} não está disponível`)
  }

  const num = ((db.prepare('SELECT MAX(num) AS n FROM tickets').get() as { n: number | null }).n ?? 0) + 1
  const id = `STU-${num}`
  const branch = ['studio/' + id.toLowerCase(), slugify(title)].filter(Boolean).join('-')
  const taskDir = path.join(TASKS_DIR, id)
  if (fs.existsSync(taskDir)) throw new HttpError(409, `A pasta ${taskDir} já existe`)
  fs.mkdirSync(taskDir, { recursive: true })

  const created: string[] = []
  try {
    for (const name of repos) {
      const base = manifestRepos.find((r) => r.name === name)!.defaultBranch
      await g.addWorktree(path.join(root, name), path.join(taskDir, name), branch, base)
      created.push(name)
    }
  } catch (err) {
    for (const name of created) {
      await g.removeWorktree(path.join(root, name), path.join(taskDir, name))
      await g.git(path.join(root, name), ['branch', '-D', branch]).catch(() => {})
    }
    fs.rmSync(taskDir, { recursive: true, force: true })
    const stderr = (err as { stderr?: string }).stderr?.trim()
    throw new HttpError(400, stderr || 'Falha ao criar a worktree')
  }
  linkContext(root, taskDir, manifestRepos.map((r) => r.name))

  db.prepare(
    `INSERT INTO tickets (id, workspace_id, title, description, repos, model, status, branch, task_dir)
     VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)`,
  ).run(id, workspaceId, title, input.description?.trim() ?? '', JSON.stringify(repos), input.model, branch, taskDir)

  run(getTicket(id))
  return getTicket(id)
}

// Contexto do workspace (CLAUDE.md, memória, skills) entra por symlink, então
// os caminhos citados nele continuam valendo dentro da pasta da tarefa.
function linkContext(root: string, taskDir: string, repoNames: string[]) {
  for (const entry of fs.readdirSync(root)) {
    if (repoNames.includes(entry) || entry === 'workspace.json' || SECRET.test(entry)) continue
    fs.symlinkSync(path.join(root, entry), path.join(taskDir, entry))
  }
}

function record(id: string, event: AgentEvent) {
  const seq = ((db.prepare('SELECT MAX(seq) AS n FROM events WHERE ticket_id = ?').get(id) as { n: number | null }).n ?? 0) + 1
  const at = new Date().toISOString()
  db.prepare('INSERT INTO events (ticket_id, seq, at, data) VALUES (?, ?, ?, ?)').run(id, seq, at, JSON.stringify(event))
  emit(id, { kind: 'event', event: { seq, at, event } })
}

function setStatus(id: string, status: TicketStatus, sessionId?: string) {
  if (sessionId) db.prepare('UPDATE tickets SET session_id = ? WHERE id = ?').run(sessionId, id)
  db.prepare('UPDATE tickets SET status = ? WHERE id = ?').run(status, id)
  emit(id, { kind: 'ticket', ticket: getTicket(id) })
}

function run(t: Ticket) {
  const prompt = t.description ? `# ${t.title}\n\n${t.description}` : t.title
  const instructions = [
    `Você está trabalhando no ticket ${t.id} do david the studio.`,
    `Os repositórios ${t.repos.join(', ')} estão nesta pasta como git worktrees na branch ${t.branch}.`,
    'Não faça commit, push nem troque de branch: o studio faz isso depois que o humano revisar o diff.',
  ].join('\n')
  record(t.id, { type: 'user', text: prompt })

  let ok = false
  claude
    .start({
      cwd: t.taskDir,
      prompt,
      model: t.model,
      instructions,
      onEvent: (e) => {
        record(t.id, e)
        if (e.type === 'start') setStatus(t.id, 'running', e.sessionId)
        if (e.type === 'result') ok = e.ok
      },
    })
    .then(() => setStatus(t.id, ok ? 'done' : 'error'))
    .catch((err) => {
      record(t.id, { type: 'result', ok: false, costUsd: 0, durationMs: 0, turns: 0, error: String(err?.message ?? err) })
      setStatus(t.id, 'error')
    })
}
