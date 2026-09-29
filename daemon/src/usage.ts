import type { AgentEvent, AgentKind, ProviderUsage, Usage, UsageSpend, User } from '@studio/shared'
import { agentStatus, claudeLimits, codexLimits } from './connections.ts'
import { db } from './db.ts'

const WEEK_MS = 7 * 24 * 60 * 60_000
const CACHE_TTL_MS = 60_000

type Row = { owner: string; at: string; data: string }

// Eventos result de tickets e conversas do usuário, de cada um que teve resultado nos últimos 7 dias.
// Vêm todos os resultados deles, inclusive os mais antigos, porque o custo do Claude é acumulado.
function results(userId: string, agent: AgentKind, since: string): Row[] {
  return db
    .prepare(
      `SELECT owner, at, data FROM (
         SELECT 't:' || e.ticket_id AS owner, e.seq, e.at, e.data FROM events e JOIN tickets t ON t.id = e.ticket_id
         WHERE t.created_by = @user AND t.agent = @agent AND json_extract(e.data, '$.type') = 'result'
         UNION ALL
         SELECT 'c:' || e.conversation_id, e.seq, e.at, e.data FROM conversation_events e JOIN conversations c ON c.id = e.conversation_id
         WHERE c.created_by = @user AND c.agent = @agent AND json_extract(e.data, '$.type') = 'result'
       ) WHERE owner IN (
         SELECT 't:' || e.ticket_id FROM events e WHERE e.at >= @since AND json_extract(e.data, '$.type') = 'result'
         UNION
         SELECT 'c:' || e.conversation_id FROM conversation_events e WHERE e.at >= @since AND json_extract(e.data, '$.type') = 'result'
       )
       ORDER BY owner, seq`,
    )
    .all({ user: userId, agent, since }) as Row[]
}

export function spend(userId: string, agent: AgentKind, now = new Date()): UsageSpend {
  const since = new Date(now.getTime() - WEEK_MS).toISOString()
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const today = midnight.toISOString()
  const out: UsageSpend = { unit: agent === 'claude' ? 'usd' : 'tokens', today: null, week: null }
  const add = (at: string, n: number) => {
    if (at < since) return
    out.week = (out.week ?? 0) + n
    if (at >= today) out.today = (out.today ?? 0) + n
  }

  let owner = ''
  let prev = 0
  for (const r of results(userId, agent, since)) {
    const e = JSON.parse(r.data) as Extract<AgentEvent, { type: 'result' }>
    if (agent === 'codex') {
      if (typeof e.tokens === 'number') add(r.at, e.tokens)
      continue
    }
    if (r.owner !== owner) {
      owner = r.owner
      prev = 0
    }
    // O SDK informa o custo acumulado da sessão (o resume continua do total salvo); soma só o incremento.
    // Resultado de falha na partida vem zerado e não pode derrubar a base.
    if (typeof e.costUsd !== 'number' || e.costUsd === 0) continue
    add(r.at, e.costUsd >= prev ? e.costUsd - prev : e.costUsd)
    prev = e.costUsd
  }
  return out
}

async function provider(user: User, agent: AgentKind): Promise<ProviderUsage> {
  const base = { agent, account: null, windows: [], spend: spend(user.id, agent) }
  let status
  try {
    status = await agentStatus(user, agent)
  } catch {
    return { ...base, state: 'error' }
  }
  const info = { ...base, account: status.account }
  if (!status.connected) return { ...info, state: 'disconnected' }
  if (status.method === 'apikey') return { ...info, state: 'apikey' }
  try {
    const windows = agent === 'claude' ? await claudeLimits(user) : await codexLimits(user)
    return windows ? { ...info, state: 'ok', windows } : { ...info, state: 'apikey' }
  } catch {
    return { ...info, state: 'error' }
  }
}

// Guarda a promessa, não só o resultado: duas aberturas seguidas do modal não sobem dois processos.
const cache = new Map<string, { at: number; value: Promise<ProviderUsage> }>()

function cached(user: User, agent: AgentKind): Promise<ProviderUsage> {
  const key = `${user.id}:${agent}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value
  const value = provider(user, agent).then((u) => {
    if (u.state === 'error') cache.delete(key)
    return u
  })
  cache.set(key, { at: Date.now(), value })
  return value
}

export async function usage(user: User): Promise<Usage> {
  const [claude, codex] = await Promise.all([cached(user, 'claude'), cached(user, 'codex')])
  return { claude, codex }
}
