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

db.exec(`
  CREATE TABLE IF NOT EXISTS test_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL REFERENCES tickets(id),
    repo TEXT NOT NULL,
    command TEXT NOT NULL,
    status TEXT NOT NULL,
    exit_code INTEGER,
    output TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL,
    finished_at TEXT
  );
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    admin INTEGER NOT NULL DEFAULT 0,
    disabled_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS invites (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL,
    used_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE TABLE IF NOT EXISTS credentials (
    user_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL,
    secret TEXT NOT NULL,
    account TEXT NOT NULL,
    PRIMARY KEY (user_id, kind)
  );
  CREATE TABLE IF NOT EXISTS conversations (
    num INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    title TEXT NOT NULL,
    agent TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL,
    session_id TEXT,
    dir TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE TABLE IF NOT EXISTS conversation_events (
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    seq INTEGER NOT NULL,
    at TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (conversation_id, seq)
  );
  CREATE TABLE IF NOT EXISTS improvements (
    num INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    ticket_id TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE TABLE IF NOT EXISTS repo_envs (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    repo TEXT NOT NULL,
    content TEXT NOT NULL,
    PRIMARY KEY (workspace_id, repo)
  );
`)

// Colunas acrescentadas depois da criação da tabela.
const ticketCols = (db.prepare('PRAGMA table_info(tickets)').all() as { name: string }[]).map((c) => c.name)
if (!ticketCols.includes('prs')) db.exec("ALTER TABLE tickets ADD COLUMN prs TEXT NOT NULL DEFAULT '{}'")
if (!ticketCols.includes('diff')) db.exec('ALTER TABLE tickets ADD COLUMN diff TEXT')
if (!ticketCols.includes('stage')) db.exec("ALTER TABLE tickets ADD COLUMN stage TEXT NOT NULL DEFAULT 'implement'")
if (!ticketCols.includes('agent')) db.exec("ALTER TABLE tickets ADD COLUMN agent TEXT NOT NULL DEFAULT 'claude'")
if (!ticketCols.includes('gates')) db.exec("ALTER TABLE tickets ADD COLUMN gates TEXT NOT NULL DEFAULT '[]'")
if (!ticketCols.includes('created_by')) db.exec('ALTER TABLE tickets ADD COLUMN created_by TEXT REFERENCES users(id)')
if (!ticketCols.includes('bases')) db.exec("ALTER TABLE tickets ADD COLUMN bases TEXT NOT NULL DEFAULT '{}'")
if (!ticketCols.includes('pick_repos')) db.exec('ALTER TABLE tickets ADD COLUMN pick_repos INTEGER NOT NULL DEFAULT 0')
const testCols = (db.prepare('PRAGMA table_info(test_runs)').all() as { name: string }[]).map((c) => c.name)
if (!testCols.includes('tree')) db.exec('ALTER TABLE test_runs ADD COLUMN tree TEXT')
