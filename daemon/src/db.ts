import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'

export const DATA_DIR = process.env.STUDIO_DATA ?? path.join(os.homedir(), '.studio')
fs.mkdirSync(DATA_DIR, { recursive: true })

export const db = new Database(path.join(DATA_DIR, 'studio.db'))
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    num INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    repos TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL,
    branch TEXT NOT NULL,
    task_dir TEXT NOT NULL,
    session_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE TABLE IF NOT EXISTS events (
    ticket_id TEXT NOT NULL REFERENCES tickets(id),
    seq INTEGER NOT NULL,
    at TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (ticket_id, seq)
  );
`)

// Colunas acrescentadas depois da criação da tabela.
const ticketCols = (db.prepare('PRAGMA table_info(tickets)').all() as { name: string }[]).map((c) => c.name)
if (!ticketCols.includes('prs')) db.exec("ALTER TABLE tickets ADD COLUMN prs TEXT NOT NULL DEFAULT '{}'")
if (!ticketCols.includes('diff')) db.exec('ALTER TABLE tickets ADD COLUMN diff TEXT')
