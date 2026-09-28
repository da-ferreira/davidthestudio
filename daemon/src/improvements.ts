import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { ImportPreview, Improvement, ImprovementImport, ImprovementPatch, ImprovementStatus, NewImprovement, User } from '@studio/shared'
import { db } from './db.ts'
import { HttpError } from './http-error.ts'
import { workspaceRepos, workspaceRoot } from './workspaces.ts'

const STATUSES: ImprovementStatus[] = ['open', 'ticket', 'done']
const FILE = 'MELHORIAS.md'

type Row = {
  id: string
  workspace_id: string
  title: string
  description: string
  status: ImprovementStatus
  ticket_id: string | null
  author: string | null
  created_at: string
  updated_at: string
}

const toImprovement = (r: Row): Improvement => ({
  id: r.id,
  workspaceId: r.workspace_id,
  title: r.title,
  description: r.description,
  status: r.status,
  ticketId: r.ticket_id,
  author: r.author,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

const SELECT = 'SELECT i.*, u.name AS author FROM improvements i LEFT JOIN users u ON u.id = i.created_by'

function getRow(workspaceId: string, id: string): Row {
  const row = db.prepare(`${SELECT} WHERE i.id = ? AND i.workspace_id = ?`).get(id, workspaceId) as Row | undefined
  if (!row) throw new HttpError(404, 'Melhoria não encontrada')
  return row
}

export function listImprovements(workspaceId: string): Improvement[] {
  workspaceRoot(workspaceId)
  return (db.prepare(`${SELECT} WHERE i.workspace_id = ? ORDER BY i.num`).all(workspaceId) as Row[]).map(toImprovement)
}

export function createImprovement(workspaceId: string, input: NewImprovement, userId: string | null): Improvement {
  workspaceRoot(workspaceId)
  const title = input.title?.trim()
  if (!title) throw new HttpError(400, 'Dê um título à melhoria')
  const id = randomUUID()
  db.prepare('INSERT INTO improvements (id, workspace_id, title, description, created_by) VALUES (?, ?, ?, ?, ?)').run(
    id,
    workspaceId,
    title,
    input.description?.trim() ?? '',
    userId,
  )
  return toImprovement(getRow(workspaceId, id))
}

export function updateImprovement(workspaceId: string, id: string, patch: ImprovementPatch): Improvement {
  const r = getRow(workspaceId, id)
  const title = patch.title === undefined ? r.title : patch.title.trim()
  if (!title) throw new HttpError(400, 'Dê um título à melhoria')
  const status = patch.status ?? r.status
  if (!STATUSES.includes(status)) throw new HttpError(400, 'Status inválido')
  const description = patch.description === undefined ? r.description : patch.description.trim()
  const ticketId = patch.ticketId === undefined ? r.ticket_id : patch.ticketId
  db.prepare("UPDATE improvements SET title = ?, description = ?, status = ?, ticket_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(
    title,
    description,
    status,
    ticketId,
    id,
  )
  return toImprovement(getRow(workspaceId, id))
}

export function deleteImprovement(workspaceId: string, id: string) {
  getRow(workspaceId, id)
  db.prepare('DELETE FROM improvements WHERE id = ?').run(id)
}

export function deleteImprovements(workspaceId: string) {
  db.prepare('DELETE FROM improvements WHERE workspace_id = ?').run(workspaceId)
}

// Formato do MELHORIAS.md: seções "## Nome" e itens "- **Título.** descrição", que podem seguir em linhas recuadas.
export function parseMarkdown(text: string): NewImprovement[] {
  const items: NewImprovement[] = []
  let section = ''
  let current: { title: string; lines: string[]; section: string } | null = null
  const flush = () => {
    if (!current) return
    const body = current.lines.join('\n').trim()
    const description = [current.section && `Seção: ${current.section}`, body].filter(Boolean).join('\n\n')
    items.push({ title: current.title, description })
    current = null
  }
  for (const line of text.split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*$/)
    if (heading) {
      flush()
      section = heading[1]
      continue
    }
    const item = line.match(/^[-*]\s+\*\*(.+?)\*\*\s*(.*)$/)
    if (item) {
      flush()
      current = { title: item[1].trim().replace(/[.:]$/, '').trim(), lines: [item[2]], section }
      continue
    }
    if (current && /^\s+\S/.test(line)) current.lines.push(line.trim())
    else flush()
  }
  flush()
  return items
}

// O MELHORIAS.md da raiz de cada repo presente, para a migração da lista solta para a tela.
export function importPreview(workspaceId: string): ImportPreview {
  const root = workspaceRoot(workspaceId)
  const texts = workspaceRepos(workspaceId)
    .map((r) => path.join(root, r.name, FILE))
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, 'utf8').trim())
  return { text: texts.join('\n\n') }
}

export function importMarkdown(workspaceId: string, text: string, user: User, dryRun: boolean): ImprovementImport {
  const seen = new Set(listImprovements(workspaceId).map((i) => i.title.toLowerCase()))
  let created = 0
  let skipped = 0
  for (const item of parseMarkdown(text ?? '')) {
    const key = item.title.toLowerCase()
    if (seen.has(key)) {
      skipped++
      continue
    }
    seen.add(key)
    created++
    if (!dryRun) createImprovement(workspaceId, item, user.id)
  }
  return { created, skipped }
}
