import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CodexStatus } from '@studio/shared'
import { HttpError } from './http-error.ts'

// O mesmo Codex que o SDK usa. Nunca "npx codex": no npm esse nome é de outro pacote.
const sdk = fileURLToPath(import.meta.resolve('@openai/codex-sdk'))
const CODEX = path.join(path.dirname(createRequire(sdk).resolve('@openai/codex/package.json')), 'bin', 'codex.js')

const LOGIN_TIMEOUT_MS = 10 * 60_000

function codex(args: string[], stdin?: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [CODEX, ...args], { timeout: 30_000 }, (err, stdout, stderr) =>
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: `${stdout}${stderr}`.trim() }),
    )
    if (stdin !== undefined) child.stdin!.end(stdin)
  })
}

let login: { child: ChildProcess; url: Promise<string> } | null = null

export async function codexStatus(): Promise<CodexStatus> {
  const { code, out } = await codex(['login', 'status'])
  const detail = out.split('\n').find((l) => l.startsWith('Logged in')) ?? out.split('\n').pop() ?? ''
  const method = /ChatGPT/.test(detail) ? 'chatgpt' : /API key/.test(detail) ? 'apikey' : null
  return { connected: code === 0, method, loggingIn: !!login }
}

// Login da conta ChatGPT: o Codex abre o navegador e espera o retorno num servidor local.
// Devolvemos a URL para a tela oferecer o link caso o navegador não abra.
export function startChatGptLogin(): Promise<string> {
  if (login) return login.url
  const child = spawn(process.execPath, [CODEX, 'login'], { stdio: ['ignore', 'pipe', 'pipe'] })
  const url = new Promise<string>((resolve, reject) => {
    let buf = ''
    const onData = (b: Buffer) => {
      buf += b.toString()
      const m = buf.match(/https:\/\/\S+/)
      if (m) resolve(m[0])
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', reject)
    child.on('close', () => reject(new HttpError(500, buf.trim().split('\n').pop() || 'O login do Codex terminou sem abrir o navegador')))
  })
  const timer = setTimeout(() => child.kill(), LOGIN_TIMEOUT_MS)
  child.on('close', () => {
    clearTimeout(timer)
    login = null
  })
  login = { child, url }
  url.catch(() => {})
  return url
}

export function cancelLogin() {
  login?.child.kill()
}

// A chave vai pelo stdin direto para o Codex, que guarda no ~/.codex; o studio não guarda nem registra.
export async function loginWithApiKey(key: string) {
  const k = key?.trim()
  if (!k) throw new HttpError(400, 'Cole a chave de API')
  const { code, out } = await codex(['login', '--with-api-key'], k)
  if (code !== 0) throw new HttpError(400, out.split('\n').pop() || 'O Codex recusou a chave')
}

export async function logout() {
  await codex(['logout'])
}
