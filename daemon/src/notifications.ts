import crypto from 'node:crypto'
import type { NotificationList, StudioNotification, WsMessage } from '@studio/shared'
import { db } from './db.ts'

type Row = { id: string; source: StudioNotification['source']; title: string; body: string; link: string | null; read_at: string | null; created_at: string }

const toNotification = (r: Row): StudioNotification => ({
  id: r.id,
  source: r.source,
  title: r.title,
  body: r.body,
  link: r.link,
  read: !!r.read_at,
  createdAt: r.created_at,
})

const listeners = new Map<string, Set<(m: WsMessage) => void>>()

export function subscribe(userId: string, fn: (m: WsMessage) => void): () => void {
  if (!listeners.has(userId)) listeners.set(userId, new Set())
  listeners.get(userId)!.add(fn)
  return () => listeners.get(userId)?.delete(fn)
}

// externalId: id na origem (OpenProject); repetir o mesmo não cria outra notificação.
// silent: grava sem avisar na hora (ex.: as antigas trazidas na primeira sincronização).
export type NewNotification = { source: StudioNotification['source']; externalId?: string; title: string; body?: string; link?: string; createdAt?: string; read?: boolean; silent?: boolean }

const emit = (userId: string, m: WsMessage) => {
  for (const fn of listeners.get(userId) ?? []) fn(m)
}

// Devolve true se gravou uma nova.
export function notify(userId: string, n: NewNotification): boolean {
  const id = crypto.randomUUID()
  const createdAt = n.createdAt ?? new Date().toISOString()
  const { changes } = db
    .prepare('INSERT OR IGNORE INTO notifications (id, user_id, source, external_id, title, body, link, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, userId, n.source, n.externalId ?? null, n.title, n.body ?? '', n.link ?? null, n.read ? createdAt : null, createdAt)
  if (!changes) return false
  if (n.read || n.silent) return true
  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as Row
  emit(userId, { kind: 'notification', notification: toNotification(row) })
  return true
}

// Pede para a tela reler a lista (mudou algo que não foi uma notificação nova).
export const refresh = (userId: string) => emit(userId, { kind: 'notifications' })

// Lidas na origem: marca aqui também as que não estão mais entre as não lidas de lá.
export function syncRead(userId: string, source: StudioNotification['source'], unreadExternalIds: string[]): boolean {
  const keep = unreadExternalIds.length ? `AND external_id NOT IN (${unreadExternalIds.map(() => '?').join(',')})` : ''
  const { changes } = db
    .prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND source = ? AND read_at IS NULL AND external_id IS NOT NULL ${keep}`)
    .run(new Date().toISOString(), userId, source, ...unreadExternalIds)
  return changes > 0
}

export function listNotifications(userId: string): NotificationList {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 200').all(userId) as Row[]
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId) as { n: number }
  return { items: rows.map(toNotification), unread: n }
}

// Sem ids: marca todas. Devolve as de origem externa, para a origem também marcar.
export function markRead(userId: string, ids?: string[]): { source: string; externalId: string }[] {
  if (ids && !ids.length) return []
  const now = new Date().toISOString()
  const where = ids ? `AND id IN (${ids.map(() => '?').join(',')})` : ''
  const rows = db
    .prepare(`SELECT source, external_id AS externalId FROM notifications WHERE user_id = ? AND read_at IS NULL AND external_id IS NOT NULL ${where}`)
    .all(userId, ...(ids ?? [])) as { source: string; externalId: string }[]
  db.prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL ${where}`).run(now, userId, ...(ids ?? []))
  return rows
}

// Entre esses ids da origem, os que já estão lidos aqui.
export function readHere(userId: string, source: StudioNotification['source'], externalIds: string[]): string[] {
  if (!externalIds.length) return []
  return (
    db
      .prepare(`SELECT external_id AS id FROM notifications WHERE user_id = ? AND source = ? AND read_at IS NOT NULL AND external_id IN (${externalIds.map(() => '?').join(',')})`)
      .all(userId, source, ...externalIds) as { id: string }[]
  ).map((r) => r.id)
}
