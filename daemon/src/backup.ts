import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR, db } from './db.ts'

const DIR = path.join(DATA_DIR, 'backups')
const KEEP = 7

// Uma cópia por dia, feita com o banco em uso. Os segredos vão cifrados: restaurar exige o master.key junto.
async function backupToday() {
  const file = path.join(DIR, `studio-${new Date().toISOString().slice(0, 10)}.db`)
  if (fs.existsSync(file)) return
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 })
  await db.backup(`${file}.tmp`)
  fs.renameSync(`${file}.tmp`, file)
  const old = fs.readdirSync(DIR).filter((f) => /^studio-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -KEEP)
  for (const f of old) fs.rmSync(path.join(DIR, f))
}

export function startBackups() {
  const run = () => backupToday().catch((err) => console.error('Falha no backup do banco:', err))
  run()
  setInterval(run, 60 * 60_000).unref()
}
