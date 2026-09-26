import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { ManifestRepo, TestRun, TestStatus, Ticket } from '@studio/shared'
import { db } from './db.ts'
import { HttpError } from './http-error.ts'
import { installCommand, markInstalled } from './node-deps.ts'
import { assertIdle, emit, getTicket, record } from './tickets.ts'
import { workspaceRepos, workspaceRoot } from './workspaces.ts'

const TIMEOUT_MS = 10 * 60_000
// Guarda o fim da saída: é onde ficam o resumo e a falha.
const MAX_OUTPUT = 512 * 1024

type Row = {
  id: number
  ticket_id: string
  repo: string
  command: string
  status: TestStatus
  exit_code: number | null
  output: string
  started_at: string
  finished_at: string | null
}

const toRun = (r: Row): TestRun => ({
  id: r.id,
  ticketId: r.ticket_id,
  repo: r.repo,
  command: r.command,
  status: r.status,
  exitCode: r.exit_code,
  output: r.output,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
})

db.prepare("UPDATE test_runs SET status = 'interrupted', finished_at = started_at WHERE status = 'running'").run()

// Por ticket: a execução em andamento (uma por vez) e como pará-la.
const active = new Map<string, { run: TestRun; stop: () => void; stopped: boolean }>()

export function listRuns(ticketId: string): TestRun[] {
  const rows = db.prepare('SELECT * FROM test_runs WHERE ticket_id = ? ORDER BY id').all(ticketId) as Row[]
  return rows.map((r) => {
    const live = active.get(ticketId)?.run
    return live?.id === r.id ? live : toRun(r)
  })
}

export const testsRunning = (ticketId: string) => active.has(ticketId)

export function runTests(ticketId: string) {
  const t = getTicket(ticketId)
  assertIdle(t)
  if (active.has(t.id)) throw new HttpError(409, 'Os testes já estão rodando')
  const repos = workspaceRepos(t.workspaceId).filter((r) => t.repos.includes(r.name) && r.test)
  if (!repos.length) throw new HttpError(400, 'Nenhum repositório deste ticket tem comando de teste; configure em Repositórios')
  // Reserva o ticket antes do primeiro await, para dois cliques não rodarem em paralelo.
  active.set(t.id, { run: null as unknown as TestRun, stop: () => {}, stopped: false })
  void (async () => {
    try {
      for (const repo of repos) {
        const status = await runRepo(t, repo)
        if (status === 'stopped') break
      }
    } finally {
      active.delete(t.id)
    }
  })()
}

export function stopTests(ticketId: string) {
  const a = active.get(ticketId)
  if (!a) throw new HttpError(409, 'Nenhum teste rodando')
  a.stopped = true
  a.stop()
}

async function runRepo(t: Ticket, repo: ManifestRepo): Promise<TestStatus> {
  const mainDir = path.join(workspaceRoot(t.workspaceId), repo.name)
  const cwd = path.join(t.taskDir, repo.name)
  const startedAt = new Date().toISOString()
  const id = Number(
    db
      .prepare("INSERT INTO test_runs (ticket_id, repo, command, status, started_at) VALUES (?, ?, ?, 'running', ?)")
      .run(t.id, repo.name, repo.test!, startedAt).lastInsertRowid,
  )
  const slot = active.get(t.id)!
  const run: TestRun = { id, ticketId: t.id, repo: repo.name, command: repo.test!, status: 'running', exitCode: null, output: '', startedAt, finishedAt: null }
  slot.run = run
  emit(t.id, { kind: 'test', run })

  const write = (chunk: string) => {
    run.output = (run.output + chunk).slice(-MAX_OUTPUT)
    emit(t.id, { kind: 'test-output', runId: id, chunk })
  }
  const env = { ...process.env, ...readEnv(path.join(mainDir, '.env')), CI: 'true', NO_COLOR: '1', FORCE_COLOR: '0' }

  let status: TestStatus
  let code: number | null = null
  try {
    const install = await installCommand(mainDir, cwd)
    if (install) {
      write(`$ ${install}\n`)
      const r = await exec(install, cwd, env, write, slot)
      if (r.code === 0) markInstalled(cwd)
      else throw new Error(r.timedOut ? 'tempo esgotado na instalação' : 'a instalação das dependências falhou')
    }
    if (slot.stopped) throw new Error('parado')
    write(`$ ${repo.test}\n`)
    const r = await exec(repo.test!, cwd, env, write, slot)
    code = r.code
    if (slot.stopped) status = 'stopped'
    else if (r.timedOut) {
      write(`\nTempo esgotado (${TIMEOUT_MS / 60_000} min); o processo foi encerrado.\n`)
      status = 'error'
    } else status = r.code === 0 ? 'passed' : 'failed'
  } catch (err) {
    status = slot.stopped ? 'stopped' : 'error'
    if (!slot.stopped) write(`\n${(err as Error).message}\n`)
  }

  run.status = status
  run.exitCode = code
  run.finishedAt = new Date().toISOString()
  db.prepare('UPDATE test_runs SET status = ?, exit_code = ?, output = ?, finished_at = ? WHERE id = ?').run(status, code, run.output, run.finishedAt, id)
  emit(t.id, { kind: 'test', run })
  record(t.id, { type: 'note', text: `Testes de ${repo.name}: ${summary(run)}` })
  return status
}

function summary(run: TestRun) {
  const secs = Math.round((Date.parse(run.finishedAt!) - Date.parse(run.startedAt)) / 1000)
  const took = secs < 60 ? `${secs} s` : `${Math.floor(secs / 60)} min ${secs % 60} s`
  if (run.status === 'passed') return `passaram (${took})`
  if (run.status === 'failed') return `falharam com código ${run.exitCode} (${took})`
  if (run.status === 'stopped') return 'parados por você'
  return `não terminaram (${took})`
}

// Grupo de processos próprio (detached) para parar também os filhos: npm test -> jest -> workers.
function exec(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  write: (s: string) => void,
  slot: { stop: () => void },
): Promise<{ code: number | null; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let timedOut = false
    const signal = (sig: NodeJS.Signals) => {
      try {
        process.kill(-child.pid!, sig)
      } catch {
        // o grupo já terminou
      }
    }
    const kill = () => {
      signal('SIGTERM')
      setTimeout(() => signal('SIGKILL'), 5000).unref()
    }
    slot.stop = kill
    const timer = setTimeout(() => {
      timedOut = true
      kill()
    }, TIMEOUT_MS)
    const onData = (b: Buffer) => write(stripAnsi(b.toString()))
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, timedOut })
    })
  })
}

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')

// KEY=valor por linha; aceita "export", comentários e aspas.
function readEnv(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {}
  const env: Record<string, string> = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    let value = m[2]
    const q = value[0]
    if ((q === '"' || q === "'") && value.endsWith(q) && value.length > 1) {
      value = value.slice(1, -1)
      if (q === '"') value = value.replace(/\\n/g, '\n')
    } else value = value.replace(/\s+#.*$/, '')
    env[m[1]] = value
  }
  return env
}
