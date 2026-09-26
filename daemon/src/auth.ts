import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import type { AuthState, Invite, NewUser, User } from '@studio/shared'
import { db } from './db.ts'
import { HttpError } from './http-error.ts'

export const COOKIE = 'studio_session'
const SESSION_DAYS = 30
const INVITE_DAYS = 7
const MAX_FAILS = 5
const LOCK_MS = 15 * 60_000

type Row = { id: string; username: string; name: string; email: string; password: string; admin: number }

const toUser = (r: Row): User => ({ id: r.id, username: r.username, name: r.name, email: r.email, admin: !!r.admin })

// No banco só fica o hash do token de sessão e de convite; vazar o banco não abre sessões.
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex')
const newToken = () => crypto.randomBytes(32).toString('base64url')
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16)
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(password, salt, 64).toString('hex')}`
}

function checkPassword(password: string, stored: string) {
  const [, salt, key] = stored.split('$')
  return crypto.timingSafeEqual(crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64), Buffer.from(key, 'hex'))
}

function gitConfig(key: string) {
  try {
    return execFileSync('git', ['config', '--global', key], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

export function authState(cookie: string | undefined): AuthState {
  const needsSetup = !(db.prepare('SELECT 1 FROM users LIMIT 1').get() as unknown)
  if (needsSetup) return { user: null, needsSetup, suggested: { name: gitConfig('user.name'), email: gitConfig('user.email') } }
  return { user: sessionUser(cookie), needsSetup }
}

export function sessionUser(cookie: string | undefined): User | null {
  const token = readCookie(cookie)
  if (!token) return null
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ? AND u.disabled_at IS NULL`,
    )
    .get(hash(token), new Date().toISOString()) as Row | undefined
  return row ? toUser(row) : null
}

function readCookie(header: string | undefined) {
  for (const part of header?.split(';') ?? []) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE) return v.join('=')
  }
  return null
}

export function sessionCookie(token: string | null, secure: boolean) {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${token ? SESSION_DAYS * 86_400 : 0}`, ...(secure ? ['Secure'] : [])]
  return [`${COOKIE}=${token ?? ''}`, ...attrs].join('; ')
}

function createSession(userId: string) {
  const token = newToken()
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString())
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(hash(token), userId, daysFromNow(SESSION_DAYS))
  return token
}

export function endSession(cookie: string | undefined) {
  const token = readCookie(cookie)
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(hash(token))
}

function validate(u: NewUser) {
  const username = u.username?.trim().toLowerCase() ?? ''
  const name = u.name?.trim() ?? ''
  const email = u.email?.trim() ?? ''
  if (!/^[a-z0-9._-]{2,32}$/.test(username)) throw new HttpError(400, 'Usuário: de 2 a 32 letras minúsculas, números, ponto, hífen ou sublinhado')
  if (!name) throw new HttpError(400, 'Informe o nome')
  if (!/^\S+@\S+$/.test(email)) throw new HttpError(400, 'Informe um e-mail válido')
  if ((u.password ?? '').length < 8) throw new HttpError(400, 'A senha precisa de ao menos 8 caracteres')
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new HttpError(409, 'Esse usuário já existe')
  return { username, name, email, password: hashPassword(u.password) }
}

function insertUser(u: NewUser, admin: boolean) {
  const v = validate(u)
  const id = crypto.randomUUID()
  db.prepare('INSERT INTO users (id, username, name, email, password, admin) VALUES (?, ?, ?, ?, ?, ?)').run(id, v.username, v.name, v.email, v.password, admin ? 1 : 0)
  return id
}

// Primeiro acesso: quem cadastra vira admin e herda os tickets que já existiam.
export function setup(u: NewUser) {
  return db.transaction(() => {
    if (db.prepare('SELECT 1 FROM users LIMIT 1').get()) throw new HttpError(409, 'O administrador já foi cadastrado')
    const id = insertUser(u, true)
    db.prepare('UPDATE tickets SET created_by = ? WHERE created_by IS NULL').run(id)
    return createSession(id)
  })()
}

// Bloqueio por usuário depois de várias senhas erradas; o studio fica exposto na internet.
const fails = new Map<string, { count: number; until: number }>()

export function login(username: string, password: string) {
  const key = username?.trim().toLowerCase() ?? ''
  const f = fails.get(key)
  if (f && f.until > Date.now()) throw new HttpError(429, 'Muitas tentativas; espere 15 minutos')
  const row = db.prepare('SELECT * FROM users WHERE username = ? AND disabled_at IS NULL').get(key) as Row | undefined
  if (!row || !checkPassword(password ?? '', row.password)) {
    const count = f && !f.until ? f.count + 1 : 1
    fails.set(key, { count, until: count >= MAX_FAILS ? Date.now() + LOCK_MS : 0 })
    throw new HttpError(401, 'Usuário ou senha incorretos')
  }
  fails.delete(key)
  return createSession(row.id)
}

export function updateProfile(user: User, input: { name: string; email: string }) {
  const name = input.name?.trim() ?? ''
  const email = input.email?.trim() ?? ''
  if (!name) throw new HttpError(400, 'Informe o nome')
  if (!/^\S+@\S+$/.test(email)) throw new HttpError(400, 'Informe um e-mail válido')
  db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(name, email, user.id)
}

// Troca a senha e derruba as outras sessões desse usuário; a atual continua.
export function changePassword(user: User, cookie: string | undefined, current: string, password: string) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as Row
  if (!checkPassword(current ?? '', row.password)) throw new HttpError(400, 'A senha atual não confere')
  if ((password ?? '').length < 8) throw new HttpError(400, 'A senha precisa de ao menos 8 caracteres')
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(password), user.id)
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(user.id, hash(readCookie(cookie) ?? ''))
}

export function listUsers(): User[] {
  return (db.prepare('SELECT * FROM users WHERE disabled_at IS NULL ORDER BY created_at').all() as Row[]).map(toUser)
}

export function removeUser(admin: User, id: string) {
  if (id === admin.id) throw new HttpError(400, 'Você não pode remover a si mesmo')
  db.prepare('UPDATE users SET disabled_at = ? WHERE id = ?').run(new Date().toISOString(), id)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
}

export function listInvites(): Invite[] {
  const rows = db
    .prepare('SELECT id, created_at, expires_at FROM invites WHERE used_by IS NULL AND expires_at > ? ORDER BY created_at DESC')
    .all(new Date().toISOString()) as { id: string; created_at: string; expires_at: string }[]
  return rows.map((r) => ({ id: r.id, createdAt: r.created_at, expiresAt: r.expires_at }))
}

// O token só aparece aqui, na criação; depois o banco guarda apenas o hash.
export function createInvite(admin: User) {
  const token = newToken()
  db.prepare('INSERT INTO invites (id, token, created_by, expires_at) VALUES (?, ?, ?, ?)').run(crypto.randomUUID(), hash(token), admin.id, daysFromNow(INVITE_DAYS))
  return { token }
}

export function revokeInvite(id: string) {
  db.prepare('DELETE FROM invites WHERE id = ? AND used_by IS NULL').run(id)
}

function openInvite(token: string) {
  const row = db.prepare('SELECT id FROM invites WHERE token = ? AND used_by IS NULL AND expires_at > ?').get(hash(token ?? ''), new Date().toISOString()) as
    | { id: string }
    | undefined
  if (!row) throw new HttpError(404, 'Convite inválido ou vencido')
  return row.id
}

export function checkInvite(token: string) {
  openInvite(token)
  return { ok: true }
}

export function acceptInvite(token: string, u: NewUser) {
  return db.transaction(() => {
    const invite = openInvite(token)
    const id = insertUser(u, false)
    db.prepare('UPDATE invites SET used_by = ? WHERE id = ?').run(id, invite)
    return createSession(id)
  })()
}

