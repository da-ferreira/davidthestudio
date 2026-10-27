import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import * as pty from 'node-pty'
import type { TerminalFont, TerminalOut, User } from '@studio/shared'
import { claudeEnv } from './connections.ts'
import { CONTAINERS } from './containers.ts'
import { db } from './db.ts'
import { HttpError } from './http-error.ts'
import * as openproject from './openproject.ts'
import { workspaceRoot } from './workspaces.ts'

// O Claude interativo de verdade num pty. O processo sobrevive a sair da tela;
// quem volta recebe o que já tinha saído e segue dali.
type Term = { proc: pty.IPty; buffer: string; clients: Set<(m: TerminalOut) => void> }
export type Size = { cols: number; rows: number }
export type Spec = { cwd: string; args: string[]; env?: Record<string, string>; onExit?: () => void }

const MAX_BUFFER = 1024 * 1024
const terms = new Map<string, Term>()

export const hasTerminal = (key: string) => terms.has(key)

// O node-pty 1.1 publica o spawn-helper sem permissão de execução; sem ela o spawn falha com posix_spawnp.
let helperReady = false
function ensureHelper() {
  if (helperReady || process.platform === 'win32') return
  const dir = path.dirname(createRequire(import.meta.url).resolve('node-pty/package.json'))
  for (const sub of [`prebuilds/${process.platform}-${process.arch}`, 'build/Release']) {
    const helper = path.join(dir, sub, 'spawn-helper')
    if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755)
  }
  helperReady = true
}

function claudeBin(env: Record<string, string | undefined>) {
  for (const dir of (env.PATH ?? '').split(':')) {
    const bin = path.join(dir, 'claude')
    if (dir && fs.existsSync(bin)) return bin
  }
  throw new HttpError(400, 'Claude Code não encontrado no PATH desta máquina; instale o claude para usar o terminal')
}

function terminalEnv(env?: Record<string, string>) {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(env ?? process.env)) if (v !== undefined) out[k] = v
  // Variáveis do próprio daemon (app do Mac, sessão do Claude que o subiu) não podem vazar para o claude do terminal.
  for (const k of Object.keys(out)) if (k === 'ELECTRON_RUN_AS_NODE' || k === 'CLAUDECODE' || k.startsWith('STUDIO_') || k.startsWith('CLAUDE_CODE_')) delete out[k]
  out.TERM = 'xterm-256color'
  out.COLORTERM = 'truecolor'
  // Aberto pelo Finder o app não tem LANG, e o Claude desenha a tela com caracteres fora do ASCII.
  out.LANG ??= 'en_US.UTF-8'
  return out
}

// Cada ticket tem pasta nova; sem isso o Claude pergunta se confia nela toda vez.
function trustFolder(cwd: string, env: Record<string, string>) {
  const file = env.CLAUDE_CONFIG_DIR ? path.join(env.CLAUDE_CONFIG_DIR, '.claude.json') : path.join(os.homedir(), '.claude.json')
  const dir = fs.realpathSync(cwd)
  try {
    const config = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
    config.projects ??= {}
    if (config.projects[dir]?.hasTrustDialogAccepted) return
    config.projects[dir] = { ...config.projects[dir], hasTrustDialogAccepted: true }
    // O Claude de outras sessões lê esse arquivo a qualquer momento; renomear evita que veja ele pela metade.
    const tmp = `${file}.studio-${process.pid}`
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, file)
  } catch {
    // Sem marcar, o Claude só faz a pergunta no terminal.
  }
}

export function openTerminal(key: string, spec: Spec, size: Size) {
  if (terms.has(key)) return
  if (CONTAINERS) throw new HttpError(409, 'O terminal ainda não roda no modo com containers')
  ensureHelper()
  const env = terminalEnv(spec.env)
  trustFolder(spec.cwd, env)
  const proc = pty.spawn(claudeBin(env), spec.args, { name: 'xterm-256color', cwd: spec.cwd, env, cols: size.cols, rows: size.rows })
  const term: Term = { proc, buffer: '', clients: new Set() }
  terms.set(key, term)
  proc.onData((data) => {
    term.buffer = (term.buffer + data).slice(-MAX_BUFFER)
    for (const send of term.clients) send({ type: 'data', data })
  })
  proc.onExit(({ exitCode }) => {
    terms.delete(key)
    for (const send of term.clients) send({ type: 'exit', code: exitCode })
    spec.onExit?.()
  })
}

export function attach(key: string, send: (m: TerminalOut) => void, size: Size): () => void {
  const term = terms.get(key)
  if (!term) {
    send({ type: 'exit', code: 0 })
    return () => {}
  }
  send({ type: 'ready' })
  if (term.buffer) send({ type: 'data', data: term.buffer })
  term.clients.add(send)
  // Mudar o tamanho e voltar faz o Claude redesenhar a tela inteira para quem acabou de chegar.
  resize(key, { cols: size.cols, rows: Math.max(size.rows - 1, 1) })
  resize(key, size)
  return () => term.clients.delete(send)
}

export function write(key: string, data: string) {
  terms.get(key)?.proc.write(data)
}

export function resize(key: string, size: Size) {
  const cols = Math.floor(size.cols)
  const rows = Math.floor(size.rows)
  if (cols > 0 && rows > 0) terms.get(key)?.proc.resize(cols, rows)
}

export function kill(key: string) {
  terms.get(key)?.proc.kill()
}

// Retomar uma sessão que nunca recebeu mensagem falha; aí o terminal começa outra.
export function sessionExists(sessionId: string, env?: Record<string, string>) {
  const dir = path.join(env?.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'projects')
  return fs.existsSync(dir) && fs.readdirSync(dir).some((p) => fs.existsSync(path.join(dir, p, `${sessionId}.jsonl`)))
}

// Terminal na raiz do workspace, um por demanda: a sessão fica guardada para reabrir a mesma conversa.
const rootKey = (workspaceId: string, demandaId: string) => `raiz:${workspaceId}:${demandaId}`

// Workspace onde a demanda já foi trabalhada: o último terminal na raiz ou, sem ele, o último ticket.
export function demandaWorkspace(demandaId: string): string | null {
  const term = db.prepare('SELECT workspace_id FROM root_terminals WHERE demanda_id = ? ORDER BY updated_at DESC LIMIT 1').get(demandaId) as { workspace_id: string } | undefined
  if (term) return term.workspace_id
  const ticket = db.prepare("SELECT workspace_id FROM tickets WHERE json_extract(demanda, '$.id') = ? ORDER BY num DESC LIMIT 1").get(demandaId) as { workspace_id: string } | undefined
  return ticket?.workspace_id ?? null
}

export async function rootTerminal(workspaceId: string, demandaId: string, user: User, size: Size): Promise<string> {
  const key = rootKey(workspaceId, demandaId)
  const cwd = workspaceRoot(workspaceId)
  if (terms.has(key)) return key
  const d = await openproject.getDemanda(user, demandaId)
  const env = claudeEnv(user)
  const row = db.prepare('SELECT session_id FROM root_terminals WHERE workspace_id = ? AND demanda_id = ?').get(workspaceId, demandaId) as { session_id: string } | undefined
  const resume = row && sessionExists(row.session_id, env) ? row.session_id : null
  const sessionId = resume ?? randomUUID()
  // Só a referência: o conteúdo da demanda o usuário cola no terminal pelo "Copiar demanda".
  const context = `Você está trabalhando na demanda #${d.id} do OpenProject: ${d.subject}\n${d.url}`
  openTerminal(key, { cwd, env, args: [...(resume ? ['--resume', resume] : ['--session-id', sessionId]), '--append-system-prompt', context] }, size)
  db.prepare(
    `INSERT INTO root_terminals (workspace_id, demanda_id, session_id, created_by) VALUES (?, ?, ?, ?)
     ON CONFLICT (workspace_id, demanda_id) DO UPDATE SET session_id = excluded.session_id, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).run(workspaceId, demandaId, sessionId, user.id)
  return key
}

// "Nova sessão": esquece a conversa guardada; o próximo terminal da demanda começa do zero.
export function resetRootSession(workspaceId: string, demandaId: string) {
  if (terms.has(rootKey(workspaceId, demandaId))) throw new HttpError(409, 'Encerre o terminal antes de começar uma sessão nova')
  db.prepare('DELETE FROM root_terminals WHERE workspace_id = ? AND demanda_id = ?').run(workspaceId, demandaId)
}

// Lê o perfil padrão do iTerm2 ("JetBrainsMono-Regular 13"). Os nomes são PostScript; a tela carrega com local().
export function itermFont(): TerminalFont {
  const plist = path.join(os.homedir(), 'Library/Preferences/com.googlecode.iterm2.plist')
  if (process.platform !== 'darwin' || !fs.existsSync(plist)) return null
  try {
    const read = (key: string) => execFileSync('plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8' }).trim()
    const guid = read('Default Bookmark Guid')
    const profiles = JSON.parse(execFileSync('plutil', ['-extract', 'New Bookmarks', 'json', '-o', '-', plist], { encoding: 'utf8' })) as Record<string, unknown>[]
    const p = profiles.find((x) => x.Guid === guid) ?? profiles[0]
    const parse = (v: unknown) => (typeof v === 'string' ? v.match(/^(\S+)\s+([\d.]+)$/) : null)
    const normal = parse(p?.['Normal Font'])
    if (!normal) return null
    const nonAscii = p['Use Non-ASCII Font'] ? parse(p['Non Ascii Font']) : null
    return { fonts: [normal[1], ...(nonAscii ? [nonAscii[1]] : [])], size: Number(normal[2]) }
  } catch {
    return null
  }
}
