import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './db.ts'

// A chave mestra nunca vai para o banco: quem copiar o studio.db (ou um backup dele) não abre os segredos.
// Ordem: STUDIO_MASTER_KEY (base64), depois o arquivo STUDIO_KEY_FILE; sem nenhum dos dois, cria o arquivo.
function loadKey() {
  const raw = process.env.STUDIO_MASTER_KEY ?? readOrCreate(process.env.STUDIO_KEY_FILE ?? path.join(DATA_DIR, 'master.key'))
  const key = Buffer.from(raw.trim(), 'base64')
  if (key.length !== 32) throw new Error('A chave mestra precisa ter 32 bytes em base64')
  return key
}

function readOrCreate(file: string) {
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8')
  const key = crypto.randomBytes(32).toString('base64')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, key + '\n', { mode: 0o600, flag: 'wx' })
  return key
}

const KEY = loadKey()
const PREFIX = 'v1:'

export const isSealed = (value: string) => value.startsWith(PREFIX)

export function seal(text: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
}

export function open(value: string) {
  const buf = Buffer.from(value.slice(PREFIX.length), 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12))
  decipher.setAuthTag(buf.subarray(12, 28))
  try {
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')
  } catch {
    throw new Error('Não foi possível abrir um segredo: a chave mestra mudou?')
  }
}
