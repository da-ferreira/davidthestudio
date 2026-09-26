import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgentKind, AgentStatus, Connections, GithubStatus } from '@studio/shared'
import { CONTAINERS, containerName, forwardKeys, homeMounts, spawnInContainer } from './containers.ts'
import { DATA_DIR, db } from './db.ts'
import { HttpError } from './http-error.ts'
import { isSealed, open, seal } from './secrets.ts'

// Os mesmos executáveis que os SDKs usam. Nunca "npx codex": no npm esse nome é de outro pacote.
const codexSdk = fileURLToPath(import.meta.resolve('@openai/codex-sdk'))
const CODEX = path.join(path.dirname(createRequire(codexSdk).resolve('@openai/codex/package.json')), 'bin', 'codex.js')
const claudeSdk = fileURLToPath(import.meta.resolve('@anthropic-ai/claude-agent-sdk'))
const CLAUDE = path.join(
  path.dirname(createRequire(claudeSdk).resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`)),
  'claude',
)

const LOGIN_TIMEOUT_MS = 15 * 60_000
// Credenciais herdadas pelo daemon são da máquina (do admin); não podem chegar a outro usuário.
const INHERITED = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'OPENAI_API_KEY', 'CODEX_API_KEY', 'GH_TOKEN', 'GITHUB_TOKEN']

type Owner = { id: string; admin: boolean }
type Env = Record<string, string>

// O admin usa as pastas padrão da máquina (o login que já existe nela); os outros, uma pasta própria.
// Com containers o login da máquina não entra no container, então o admin também tem a sua.
const usesMachine = (user: Owner) => user.admin && !CONTAINERS

function home(user: Owner, agent: AgentKind) {
  if (usesMachine(user)) return undefined
  const dir = path.join(DATA_DIR, 'users', user.id, agent)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}

// Linhas gravadas antes da criptografia existir.
for (const r of db.prepare('SELECT user_id, kind, secret FROM credentials').all() as { user_id: string; kind: string; secret: string }[])
  if (!isSealed(r.secret)) db.prepare('UPDATE credentials SET secret = ? WHERE user_id = ? AND kind = ?').run(seal(r.secret), r.user_id, r.kind)

function credential(userId: string, kind: 'anthropic' | 'github') {
  const row = db.prepare('SELECT secret, account FROM credentials WHERE user_id = ? AND kind = ?').get(userId, kind) as { secret: string; account: string } | undefined
  return row && { secret: open(row.secret), account: row.account }
}

function saveCredential(userId: string, kind: 'anthropic' | 'github', secret: string, account: string) {
  db.prepare('INSERT OR REPLACE INTO credentials (user_id, kind, secret, account) VALUES (?, ?, ?, ?)').run(userId, kind, seal(secret), account)
}

function dropCredential(userId: string, kind: 'anthropic' | 'github') {
  db.prepare('DELETE FROM credentials WHERE user_id = ? AND kind = ?').run(userId, kind)
}

function cleanEnv(): Env {
  const env = { ...process.env } as Env
  for (const k of INHERITED) delete env[k]
  return env
}

// undefined: herda o ambiente do daemon, ou seja, o login da máquina.
export function claudeEnv(user: Owner): Env | undefined {
  const key = credential(user.id, 'anthropic')
  const dir = home(user, 'claude')
  if (!key && !dir) return undefined
  return { ...cleanEnv(), ...(dir && { CLAUDE_CONFIG_DIR: dir }), ...(key && { ANTHROPIC_API_KEY: key.secret }) }
}

export function codexEnv(user: Owner): Env | undefined {
  const dir = home(user, 'codex')
  return dir ? { ...cleanEnv(), CODEX_HOME: dir } : undefined
}

// Token por cima de qualquer credential helper da máquina, só para o github.com.
export function gitEnv(user: Owner): Env {
  const token = credential(user.id, 'github')?.secret
  if (!token) {
    if (usesMachine(user)) return {}
    throw new HttpError(400, 'Conecte o GitHub na tela Conexões')
  }
  return {
    STUDIO_GH_TOKEN: token,
    GH_TOKEN: token,
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'credential.https://github.com.helper',
    GIT_CONFIG_VALUE_0: '',
    GIT_CONFIG_KEY_1: 'credential.https://github.com.helper',
    GIT_CONFIG_VALUE_1: '!f() { echo username=x-access-token; echo "password=$STUDIO_GH_TOKEN"; }; f',
  }
}

// A CLI do agente, na máquina ou no container (onde as credenciais ficam no formato do Linux).
function spawnCli(user: Owner, agent: AgentKind, args: string[]): ChildProcess {
  const env = agent === 'claude' ? claudeEnv(user) : codexEnv(user)
  if (CONTAINERS) {
    const name = containerName('login', `${user.id}-${agent}-${Math.random().toString(36).slice(2, 8)}`)
    return spawnInContainer({ name, cwd: '/home/agent', mounts: homeMounts(env), command: agent, args, env: env!, envKeys: forwardKeys(env!) })
  }
  const [file, all] = agent === 'claude' ? [CLAUDE, args] : [process.execPath, [CODEX, ...args]]
  return spawn(file, all, { env: env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'] })
}

function cli(user: Owner, agent: AgentKind, args: string[], stdin?: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawnCli(user, agent, args)
    let out = ''
    child.stdout!.on('data', (b) => (out += b))
    child.stderr!.on('data', (b) => (out += b))
    const timer = setTimeout(() => child.kill(), CONTAINERS ? 60_000 : 30_000)
    child.on('error', () => {})
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, out: out.trim() })
    })
    child.stdin!.end(stdin)
  })
}

const codexCli = (user: Owner, args: string[], stdin?: string) => cli(user, 'codex', args, stdin)
const claudeCli = (user: Owner, args: string[]) => cli(user, 'claude', args)

type Login = { child: ChildProcess; out: string; info: Promise<{ url: string; code: string | null }>; shown: { url: string; code: string | null } | null }
const logins = new Map<string, Login>()
const loginKey = (user: Owner, agent: AgentKind) => `${user.id}:${agent}`
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

export async function agentStatus(user: Owner, agent: AgentKind): Promise<AgentStatus> {
  const login = logins.get(loginKey(user, agent))?.shown ?? null
  if (agent === 'claude') {
    const key = credential(user.id, 'anthropic')
    if (key) return { connected: true, method: 'apikey', account: key.account, login: null, machine: false }
    const { out } = await claudeCli(user, ['auth', 'status', '--json'])
    let s: { loggedIn?: boolean; authMethod?: string; email?: string } = {}
    try {
      s = JSON.parse(out)
    } catch {}
    const method = !s.loggedIn ? null : s.authMethod === 'claude.ai' ? 'subscription' : 'apikey'
    return { connected: !!s.loggedIn, method, account: s.email ?? null, login, machine: usesMachine(user) }
  }
  const { code, out } = await codexCli(user, ['login', 'status'])
  const detail = out.split('\n').find((l) => l.startsWith('Logged in')) ?? ''
  const method = code !== 0 ? null : /ChatGPT/.test(detail) ? 'subscription' : 'apikey'
  return { connected: code === 0, method, account: detail.split(' - ')[1]?.trim() ?? null, login, machine: usesMachine(user) }
}

export async function connections(user: Owner): Promise<Connections> {
  const [claude, codex] = await Promise.all([agentStatus(user, 'claude'), agentStatus(user, 'codex')])
  return { claude, codex, github: githubStatus(user) }
}

// Entrada pela assinatura sem depender do navegador da máquina do daemon: o Claude mostra
// um link e espera o código colado de volta; o Codex usa código de dispositivo.
export function startLogin(user: Owner, agent: AgentKind) {
  const key = loginKey(user, agent)
  const existing = logins.get(key)
  if (existing) return existing.info
  const child = spawnCli(user, agent, agent === 'claude' ? ['auth', 'login'] : ['login', '--device-auth'])
  const login: Login = { child, out: '', shown: null, info: null! }
  login.info = new Promise((resolve, reject) => {
    const onData = (b: Buffer) => {
      login.out += b.toString()
      if (login.shown) return
      const text = stripAnsi(login.out)
      const url = text.match(/https:\/\/[^\s\x07\x1b]+/)?.[0]
      const code = agent === 'codex' ? (text.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4,6}\b/)?.[0] ?? null) : null
      if (url && (agent === 'claude' || code)) resolve((login.shown = { url, code }))
    }
    child.stdout!.on('data', onData)
    child.stderr!.on('data', onData)
    child.on('error', reject)
    child.on('close', () => reject(new HttpError(500, lastLine(login.out) || 'O login terminou sem mostrar o link')))
  })
  login.info.catch(() => {})
  const timer = setTimeout(() => child.kill(), LOGIN_TIMEOUT_MS)
  child.on('close', () => {
    clearTimeout(timer)
    if (logins.get(key) === login) logins.delete(key)
  })
  logins.set(key, login)
  return login.info
}

const lastLine = (s: string) => stripAnsi(s).trim().split('\n').pop()?.trim() ?? ''

// Código que o site da Anthropic mostra depois do login; o Claude troca pelo token e sai.
export async function submitClaudeCode(user: Owner, code: string) {
  const login = logins.get(loginKey(user, 'claude'))
  if (!login) throw new HttpError(400, 'O login expirou; comece de novo')
  if (!code?.trim()) throw new HttpError(400, 'Cole o código')
  const before = login.out.length
  const exited = new Promise<number | null>((resolve) => login.child.on('close', resolve))
  login.child.stdin!.write(`${code.trim()}\n`)
  const result = await Promise.race([exited, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 30_000))])
  if (result === 0) return
  if (result === 'timeout') login.child.kill()
  throw new HttpError(400, lastLine(login.out.slice(before)) || 'O Claude não aceitou o código')
}

export function cancelLogin(user: Owner, agent: AgentKind) {
  logins.get(loginKey(user, agent))?.child.kill()
}

// A chave do Claude fica no studio e entra no ambiente do agente; a do Codex vai para o CODEX_HOME do usuário.
export async function saveApiKey(user: Owner, agent: AgentKind, input: string) {
  const key = input?.trim()
  if (!key) throw new HttpError(400, 'Cole a chave de API')
  if (agent === 'codex') {
    // O Codex grava qualquer chave sem testar; confere antes na OpenAI.
    const res = await fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${key}` } })
    if (res.status === 401 || res.status === 403) throw new HttpError(400, 'A OpenAI recusou a chave')
    if (!res.ok) throw new HttpError(400, `A OpenAI respondeu ${res.status}; tente de novo`)
    const { code, out } = await codexCli(user, ['login', '--with-api-key'], key)
    if (code !== 0) throw new HttpError(400, lastLine(out) || 'O Codex recusou a chave')
    return
  }
  const res = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } })
  if (res.status === 401 || res.status === 403) throw new HttpError(400, 'A Anthropic recusou a chave')
  if (!res.ok) throw new HttpError(400, `A Anthropic respondeu ${res.status}; tente de novo`)
  saveCredential(user.id, 'anthropic', key, `…${key.slice(-4)}`)
}

// Sem a chave própria, o Claude volta para o login por assinatura (se houver).
export async function logout(user: Owner, agent: AgentKind) {
  if (agent === 'claude' && credential(user.id, 'anthropic')) return dropCredential(user.id, 'anthropic')
  if (agent === 'claude') await claudeCli(user, ['auth', 'logout'])
  else await codexCli(user, ['logout'])
}

export function githubStatus(user: Owner): GithubStatus {
  const cred = credential(user.id, 'github')
  if (cred) return { connected: true, account: cred.account, machine: false }
  return { connected: usesMachine(user), account: null, machine: usesMachine(user) }
}

export async function saveGithubToken(user: Owner, input: string) {
  const token = input?.trim()
  if (!token) throw new HttpError(400, 'Cole o token')
  const res = await fetch('https://api.github.com/user', { headers: { authorization: `Bearer ${token}`, 'user-agent': 'david-the-studio' } })
  if (res.status === 401) throw new HttpError(400, 'O GitHub recusou o token')
  if (!res.ok) throw new HttpError(400, `O GitHub respondeu ${res.status}; tente de novo`)
  const { login } = (await res.json()) as { login: string }
  saveCredential(user.id, 'github', token, login)
}

export function removeGithubToken(user: Owner) {
  dropCredential(user.id, 'github')
}
