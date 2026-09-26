import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { AgentEvent, DocStage, NewTicket, RepoDiff, Reply, Stage, Ticket, TicketDetail, TicketDocs, TicketEvent, TicketStatus, WsMessage } from '@studio/shared'
import * as claude from './agents/claude.ts'
import { DATA_DIR, db } from './db.ts'
import * as g from './git.ts'
import { HttpError } from './http-error.ts'
import { isUnified, workspaceRepos, workspaceRoot } from './workspaces.ts'

const TASKS_DIR = path.join(DATA_DIR, 'tasks')
const MODELS = ['opus', 'sonnet', 'haiku']
const DOC_STAGES: DocStage[] = ['spec', 'plan']
// Pasta dos documentos dentro da pasta da tarefa; fora dos repos, não entra em commit.
const DOCS_DIR = '.studio'
const DOC: Record<DocStage, { name: string; the: string; ready: string; approved: string }> = {
  spec: { name: 'spec', the: 'a spec', ready: 'pronta', approved: 'aprovada' },
  plan: { name: 'plano', the: 'o plano', ready: 'pronto', approved: 'aprovado' },
}
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
  stage: Stage
  gates: string
  prs: string
  diff: string | null
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
  stage: r.stage,
  gates: JSON.parse(r.gates),
  prs: JSON.parse(r.prs),
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
db.prepare("UPDATE tickets SET status = 'interrupted' WHERE status IN ('running', 'waiting')").run()

const sessions = new Map<string, claude.Session>()
const asks = new Map<string, { ticket: string; resolve: (r: Reply) => void }>()
// Mensagens que chegaram enquanto a sessão encerrava; viram um resume logo em seguida.
const pending = new Map<string, string[]>()
const stopping = new Set<string>()

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

// Tickets com worktree ainda de pé (não encerrados nem descartados).
export function openTickets(workspaceId: string): string[] {
  return listTickets(workspaceId)
    .filter((t) => t.status !== 'closed' && t.status !== 'discarded')
    .map((t) => t.id)
}

export function deleteTickets(workspaceId: string) {
  db.prepare('DELETE FROM events WHERE ticket_id IN (SELECT id FROM tickets WHERE workspace_id = ?)').run(workspaceId)
  db.prepare('DELETE FROM tickets WHERE workspace_id = ?').run(workspaceId)
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
  const gates = DOC_STAGES.filter((st) => input.gates?.includes(st))
  const stage: Stage = input.sdd === false ? 'implement' : 'spec'
  for (const name of repos) {
    const repo = manifestRepos.find((r) => r.name === name)
    if (!repo || !fs.existsSync(path.join(root, name, '.git'))) throw new HttpError(400, `Repositório ${name} não está disponível`)
  }

  // Contador do AUTOINCREMENT, não MAX(num): ticket apagado não pode ter o número reusado,
  // porque a branch studio/stu-N dele continua nos repos.
  const seq = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'tickets'").get() as { seq: number } | undefined
  const num = (seq?.seq ?? 0) + 1
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
  fs.mkdirSync(path.join(taskDir, DOCS_DIR))

  db.prepare(
    `INSERT INTO tickets (num, id, workspace_id, title, description, repos, model, status, branch, task_dir, stage, gates)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?)`,
  ).run(num, id, workspaceId, title, input.description?.trim() ?? '', JSON.stringify(repos), input.model, branch, taskDir, stage, JSON.stringify(gates))

  const t = getTicket(id)
  const prompt = t.description ? `# ${t.title}\n\n${t.description}` : t.title
  record(id, { type: 'user', text: prompt })
  run(t, prompt)
  return getTicket(id)
}

// Contexto do workspace (CLAUDE.md, memória, skills) entra por symlink, então
// os caminhos citados nele continuam valendo dentro da pasta da tarefa.
function linkContext(root: string, taskDir: string, repoNames: string[]) {
  for (const entry of fs.readdirSync(root)) {
    if (repoNames.includes(entry) || entry === 'workspace.json' || SECRET.test(entry)) continue
    fs.symlinkSync(path.join(root, contextTarget(root, entry)), path.join(taskDir, entry))
  }
}

// O Claude não resolve o @AGENTS.md de um CLAUDE.md que é symlink. No workspace
// unificado o CLAUDE.md aponta direto para o AGENTS.md, que tem o mesmo conteúdo.
function contextTarget(root: string, entry: string) {
  return entry === 'CLAUDE.md' && isUnified(root) ? 'AGENTS.md' : entry
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

export function sendMessage(id: string, input: string) {
  const text = input?.trim()
  if (!text) throw new HttpError(400, 'Mensagem vazia')
  const t = getTicket(id)
  assertOpen(t)
  const s = sessions.get(id)
  if (s && stopping.has(id)) throw new HttpError(409, 'O agente está parando; mande de novo em instantes')
  record(id, { type: 'user', text })
  if (s?.send(text)) return
  if (s) pending.set(id, [...(pending.get(id) ?? []), text])
  else run(t, text, t.sessionId)
}

export async function stopTicket(id: string) {
  getRow(id)
  const s = sessions.get(id)
  if (!s) throw new HttpError(409, 'O agente não está rodando')
  stopping.add(id)
  pending.delete(id)
  await s.stop()
}

export function answerAsk(id: string, askId: string, reply: Reply) {
  const a = asks.get(askId)
  if (!a || a.ticket !== id) throw new HttpError(404, 'Essa pergunta não está mais aberta')
  asks.delete(askId)
  record(id, { type: 'answer', id: askId, reply: { allow: !!reply.allow, answers: reply.answers } })
  a.resolve(reply)
  if (![...asks.values()].some((x) => x.ticket === id)) setStatus(id, 'running')
}

function dropAsks(id: string) {
  for (const [askId, a] of asks) if (a.ticket === id) asks.delete(askId)
}

const STAGE_INSTRUCTIONS: Record<Stage, string> = {
  spec: [
    'Etapa atual: Spec. Não altere código nesta etapa.',
    'Leia o código e o contexto que precisar. Se faltar informação para decidir, pergunte com AskUserQuestion.',
    `Escreva a spec em ${DOCS_DIR}/spec.md, em português: objetivo, contexto, critérios de aceite verificáveis e o que fica fora do escopo.`,
    'Ao terminar, responda com um resumo curto. O humano vai aprovar a spec ou pedir ajustes.',
  ].join('\n'),
  plan: [
    `Etapa atual: Plano. A spec aprovada está em ${DOCS_DIR}/spec.md. Não altere código nesta etapa.`,
    `Escreva o plano em ${DOCS_DIR}/plan.md, em português, como checklist markdown (- [ ] passo), agrupado por repositório.`,
    'Todo passo precisa ser uma linha - [ ]: o studio mostra o progresso a partir delas.',
    'Cada passo pequeno e verificável; inclua os testes que vai criar ou rodar.',
    'Ao terminar, responda com um resumo curto. O humano vai aprovar o plano ou pedir ajustes.',
  ].join('\n'),
  implement: `Etapa atual: Implementação. Se existir ${DOCS_DIR}/plan.md, siga o plano e marque cada passo como - [x] no arquivo ao concluir; se precisar desviar dele, avise.`,
  review: 'Etapa atual: Revisão. O humano está revisando o diff; faça só os ajustes que ele pedir.',
}

function run(t: Ticket, prompt: string, resume?: string | null) {
  const instructions = [
    `Você está trabalhando no ticket ${t.id} do david the studio.`,
    `Os repositórios são as subpastas ${t.repos.map((r) => `${r}/`).join(', ')} da pasta atual, já prontos na branch ${t.branch}.`,
    `Todo arquivo de código fica dentro de uma dessas subpastas (ex.: ${t.repos[0]}/...); o que ficar na raiz da pasta atual não é versionado e se perde.`,
    'Não faça commit, push nem troque de branch: o studio faz isso depois que o humano revisar o diff.',
    STAGE_INSTRUCTIONS[t.stage],
  ].join('\n')
  setStatus(t.id, 'running')

  let ok = false
  const session = claude.start({
    cwd: t.taskDir,
    prompt,
    model: t.model,
    instructions,
    resume,
    writableDir: isDocStage(t.stage) ? path.join(t.taskDir, DOCS_DIR) : undefined,
    onEvent: (e) => {
      if (e.type === 'result' && stopping.has(t.id)) e = { ...e, ok: false, error: 'parado por você' }
      record(t.id, e)
      if (e.type === 'start') setStatus(t.id, 'running', e.sessionId)
      if (e.type === 'result') ok = e.ok
    },
    onAsk: (askId, ask, signal) =>
      new Promise((resolve) => {
        asks.set(askId, { ticket: t.id, resolve })
        record(t.id, { type: 'ask', id: askId, ask })
        setStatus(t.id, 'waiting')
        signal.addEventListener('abort', () => asks.delete(askId) && resolve({ allow: false }))
      }),
  })
  sessions.set(t.id, session)

  session.done
    .catch((err) => {
      if (!stopping.has(t.id)) record(t.id, { type: 'result', ok: false, costUsd: 0, durationMs: 0, turns: 0, error: String(err?.message ?? err) })
      ok = false
    })
    .then(() => {
      sessions.delete(t.id)
      dropAsks(t.id)
      const next = pending.get(t.id)
      pending.delete(t.id)
      if (stopping.delete(t.id)) return setStatus(t.id, 'interrupted')
      if (next) return run(getTicket(t.id), next.join('\n\n'), getTicket(t.id).sessionId)
      if (!ok) return setStatus(t.id, 'error')
      afterTurn(getTicket(t.id))
    })
}

const isDocStage = (st: Stage): st is DocStage => st === 'spec' || st === 'plan'
const docPath = (t: Ticket, st: DocStage) => path.join(t.taskDir, DOCS_DIR, `${st}.md`)
// Cópia na raiz do workspace: fica depois que a pasta da tarefa é apagada.
const savedDocPath = (t: Ticket, st: DocStage) =>
  path.join(workspaceRoot(t.workspaceId), 'specs', [t.id, slugify(t.title)].filter(Boolean).join('-'), `${st}.md`)

function readDoc(t: Ticket, st: DocStage): string | null {
  for (const file of [docPath(t, st), savedDocPath(t, st)]) if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8')
  return null
}

function saveDocs(t: Ticket) {
  for (const st of DOC_STAGES) {
    if (!fs.existsSync(docPath(t, st))) continue
    fs.mkdirSync(path.dirname(savedDocPath(t, st)), { recursive: true })
    fs.copyFileSync(docPath(t, st), savedDocPath(t, st))
  }
}

function setStage(id: string, stage: Stage) {
  db.prepare('UPDATE tickets SET stage = ? WHERE id = ?').run(stage, id)
}

// O agente terminou o turno sem erro: decide se para para aprovação, avança ou só espera o humano.
function afterTurn(t: Ticket) {
  if (isDocStage(t.stage)) {
    if (!fs.existsSync(docPath(t, t.stage))) return setStatus(t.id, 'done')
    if (t.gates.includes(t.stage)) return setStatus(t.id, 'approval')
    record(t.id, { type: 'note', text: `${DOC[t.stage].name} ${DOC[t.stage].ready}; segue sem aprovação, como configurado no ticket` })
    return advance(t, false)
  }
  if (t.stage === 'implement') setStage(t.id, 'review')
  setStatus(t.id, 'done')
}

function advance(t: Ticket, approved: boolean) {
  const from = t.stage as DocStage
  const to: Stage = from === 'spec' ? 'plan' : 'implement'
  saveDocs(t)
  setStage(t.id, to)
  const done = approved ? `foi ${DOC[from].approved}` : `está ${DOC[from].ready}`
  const text =
    from === 'spec'
      ? `A spec ${done}. Agora escreva o plano em ${DOCS_DIR}/plan.md, com cada passo numa linha - [ ].`
      : `O plano ${done}. Pode implementar, dentro das pastas dos repositórios, marcando - [x] em cada passo concluído.`
  record(t.id, { type: 'user', text })
  run(getTicket(t.id), text, t.sessionId)
}

function assertDocStage(stage: string): asserts stage is DocStage {
  if (!DOC_STAGES.includes(stage as DocStage)) throw new HttpError(400, 'Etapa inválida')
}

export function approveDoc(id: string, stage: DocStage) {
  assertDocStage(stage)
  const t = getTicket(id)
  assertIdle(t)
  if (t.stage !== stage) throw new HttpError(409, `O ticket não está na etapa de ${DOC[stage].name}`)
  if (!fs.existsSync(docPath(t, stage))) throw new HttpError(409, `O agente ainda não escreveu ${DOC[stage].the}`)
  record(id, { type: 'note', text: `${DOC[stage].name} ${DOC[stage].approved}; cópia salva em specs/ na raiz do workspace` })
  advance(t, true)
}

export function getDocs(id: string): TicketDocs {
  const t = getTicket(id)
  return { spec: readDoc(t, 'spec'), plan: readDoc(t, 'plan') }
}

// Só o documento da etapa atual é editável; os anteriores já foram aprovados.
export function editDoc(id: string, stage: DocStage, content: string) {
  assertDocStage(stage)
  const t = getTicket(id)
  assertIdle(t)
  if (t.stage !== stage) throw new HttpError(409, `Não dá mais para editar ${DOC[stage].the}`)
  if (!content?.trim()) throw new HttpError(400, 'O texto não pode ficar vazio')
  fs.writeFileSync(docPath(t, stage), content.endsWith('\n') ? content : content + '\n')
  record(id, { type: 'note', text: `você editou ${DOC[stage].the}` })
  if (t.gates.includes(stage)) setStatus(id, 'approval')
}

const exec = promisify(execFile)

const isClosed = (t: Ticket) => t.status === 'closed' || t.status === 'discarded'

function assertOpen(t: Ticket) {
  if (isClosed(t)) throw new HttpError(409, 'O ticket está encerrado')
}

function assertIdle(t: Ticket) {
  assertOpen(t)
  if (t.status === 'running' || t.status === 'waiting') throw new HttpError(409, 'Pare o agente ou espere ele terminar antes')
}

function baseBranchOf(t: Ticket, repo: string) {
  return workspaceRepos(t.workspaceId).find((r) => r.name === repo)?.defaultBranch ?? 'main'
}

export async function getDiff(id: string): Promise<RepoDiff[]> {
  const t = getTicket(id)
  const saved = getRow(id).diff
  if (saved) return JSON.parse(saved)
  return Promise.all(
    t.repos.map(async (repo) => {
      const dir = path.join(t.taskDir, repo)
      const baseBranch = baseBranchOf(t, repo)
      const base = await g.forkPoint(dir, baseBranch)
      const [files, uncommitted, commits, unpushed] = await Promise.all([
        g.worktreeDiff(dir, base),
        g.changedFiles(dir),
        g.commitsSince(dir, base),
        g.unpushedCount(dir, t.branch, base),
      ])
      return { repo, base: baseBranch, files, uncommitted, commits, unpushed, pr: t.prs[repo] ?? null }
    }),
  )
}

// Commit com a identidade git da máquina (quem aprovou) e o agente como coautor.
export async function commitTicket(id: string, input: string) {
  const t = getTicket(id)
  assertIdle(t)
  const subject = input?.trim()
  if (!subject) throw new HttpError(400, 'Escreva a mensagem do commit')
  const message = `${subject}\n\nTicket ${t.id} do david the studio.\n\nCo-Authored-By: Claude <noreply@anthropic.com>`

  const dirs = t.repos.map((repo) => ({ repo, dir: path.join(t.taskDir, repo) }))
  const toCommit: typeof dirs = []
  for (const d of dirs) {
    if (!(await g.changedFiles(d.dir))) continue
    await g.git(d.dir, ['add', '-A'])
    const secrets = (await g.git(d.dir, ['diff', '--cached', '--name-only'])).split('\n').filter((f) => SECRET.test(path.basename(f)))
    if (secrets.length) {
      await g.git(d.dir, ['reset', '-q'])
      throw new HttpError(400, 'Há arquivos que parecem segredos; tire-os antes de commitar', secrets.map((f) => `${d.repo}/${f}`))
    }
    toCommit.push(d)
  }
  if (!toCommit.length) throw new HttpError(400, 'Não há mudanças para commitar')
  for (const d of toCommit) {
    await g.git(d.dir, ['commit', '-q', '-m', message])
    const sha = await g.git(d.dir, ['rev-parse', '--short', 'HEAD'])
    record(id, { type: 'note', text: `commit ${sha} em ${d.repo}: ${subject}` })
  }
}

// Um PR por repo com commits. Se o PR já existe, só sobe os commits novos.
export async function openPrs(id: string) {
  const t = getTicket(id)
  assertIdle(t)
  const prs = { ...t.prs }
  let acted = 0
  for (const repo of t.repos) {
    const dir = path.join(t.taskDir, repo)
    const baseBranch = baseBranchOf(t, repo)
    const base = await g.forkPoint(dir, baseBranch)
    const unpushed = await g.unpushedCount(dir, t.branch, base)
    if (!(await g.commitsSince(dir, base)).length || (!unpushed && prs[repo])) continue
    if (!(await g.remoteUrl(dir))) throw new HttpError(400, `${repo} não tem remote origin`)
    if (unpushed) {
      try {
        await g.git(dir, ['push', '-q', '-u', 'origin', t.branch])
      } catch (err) {
        throw new HttpError(400, `Falha no push de ${repo}`, [(err as { stderr?: string }).stderr?.trim() || String(err)])
      }
    }
    acted++
    if (prs[repo]) {
      record(id, { type: 'note', text: `push em ${repo}; o PR foi atualizado`, url: prs[repo] })
      continue
    }
    const docs = getDocs(id)
    const body = [
      t.description,
      docs.spec && `## Spec\n\n${docs.spec.trim()}`,
      docs.plan && `## Plano\n\n${docs.plan.trim()}`,
      `Ticket ${t.id} do david the studio, feito com Claude Code.`,
    ]
      .filter(Boolean)
      .join('\n\n')
    try {
      const { stdout } = await exec('gh', ['pr', 'create', '--base', baseBranch, '--head', t.branch, '--title', t.title, '--body', body], {
        cwd: dir,
        env: { ...process.env, GH_PROMPT_DISABLED: '1' },
      })
      prs[repo] = stdout.trim().split('\n').pop()!
    } catch (err) {
      const e = err as { code?: string; stderr?: string }
      if (e.code === 'ENOENT') throw new HttpError(400, 'O GitHub CLI (gh) não está instalado')
      throw new HttpError(400, `Falha ao abrir o PR de ${repo}`, [e.stderr?.trim() || String(err)])
    } finally {
      db.prepare('UPDATE tickets SET prs = ? WHERE id = ?').run(JSON.stringify(prs), id)
    }
    record(id, { type: 'note', text: `PR aberto em ${repo}`, url: prs[repo] })
  }
  if (!acted) throw new HttpError(400, 'Nada para enviar: commite as mudanças primeiro')
  emit(id, { kind: 'ticket', ticket: getTicket(id) })
}

// Grava o diff e remove as worktrees; a branch fica no repo. Com mudanças não
// commitadas ou commits sem push, só encerra se o humano escolheu descartar.
export async function closeTicket(id: string, discard: boolean) {
  const t = getTicket(id)
  assertIdle(t)
  const diffs = await getDiff(id)
  const reasons = diffs.flatMap((d) => [
    ...(d.uncommitted ? [`${d.repo}: ${d.uncommitted} arquivo(s) sem commit`] : []),
    ...(d.unpushed ? [`${d.repo}: ${d.unpushed} commit(s) sem push`] : []),
  ])
  if (reasons.length && !discard) throw new HttpError(409, 'Há trabalho que seria perdido', reasons)

  db.prepare('UPDATE tickets SET diff = ? WHERE id = ?').run(JSON.stringify(diffs), id)
  // De novo ao encerrar: o plano ganhou os passos marcados durante a implementação.
  saveDocs(t)
  const root = workspaceRoot(t.workspaceId)
  for (const repo of t.repos) await g.removeWorktree(path.join(root, repo), path.join(t.taskDir, repo))
  // Só sobram os symlinks do contexto; rmSync não segue symlink.
  fs.rmSync(t.taskDir, { recursive: true, force: true })
  const status = reasons.length ? 'discarded' : 'closed'
  record(id, {
    type: 'note',
    text: `${status === 'closed' ? 'ticket concluído' : 'ticket descartado'}; worktrees removidas, a branch ${t.branch} fica`,
  })
  setStatus(id, status)
}
