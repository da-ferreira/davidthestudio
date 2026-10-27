import type { Demanda, DemandaActivity, DemandaAttachment, DemandaDetail, DemandaEditOptions, DemandaField, DemandaPatch, DemandaPage, DemandaQuery, DemandaRef, DemandasMeta, DemandaStatus, OpenProjectStatus } from '@studio/shared'
import { credential, dropCredential, saveCredential } from './connections.ts'
import { db } from './db.ts'
import { HttpError } from './http-error.ts'
import { notify, readHere, refresh, syncRead } from './notifications.ts'

type Owner = { id: string }
type Conn = { url: string; token: string }

// Aceita qualquer link copiado do navegador (ex.: .../my/access_tokens) e fica com a base da instalação,
// que pode estar numa subpasta.
function baseUrl(input: string) {
  let u: URL
  try {
    u = new URL(input.trim())
  } catch {
    throw new HttpError(400, 'Endereço inválido; use algo como http://servidor:8080')
  }
  const cut = u.pathname.search(/\/(api\/v3|my|projects|work_packages|notifications|admin|login)(\/|$)/)
  const base = (cut >= 0 ? u.pathname.slice(0, cut) : u.pathname).replace(/\/+$/, '')
  return `${u.origin}${base}`
}

function conn(user: Owner): Conn | null {
  const c = credential(user.id, 'openproject')
  return c ? (JSON.parse(c.secret) as Conn) : null
}

const auth = (token: string) => `Basic ${Buffer.from(`apikey:${token}`).toString('base64')}`

async function call(c: Conn, path: string, init?: { method?: string; body?: unknown }) {
  let res: Response
  try {
    res = await fetch(`${c.url}/api/v3${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        authorization: auth(c.token),
        ...(init?.body !== undefined && { 'content-type': 'application/json' }),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new HttpError(502, `Não foi possível falar com o OpenProject em ${c.url}`)
  }
  return res
}

// Chamada da API v3 com o token de quem pediu. Erros do OpenProject viram a mensagem dele (já em português).
export async function op<T>(user: Owner, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const c = conn(user)
  if (!c) throw new HttpError(400, 'Conecte o OpenProject na tela Conexões')
  const res = await call(c, path, init)
  const data = (await res.json().catch(() => null)) as {
    message?: string
  } | null
  if (res.status === 401) throw new HttpError(400, 'O OpenProject recusou o token; gere outro e conecte de novo em Conexões')
  if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 400, data?.message ?? `O OpenProject respondeu ${res.status}`)
  return data as T
}

export function openprojectStatus(user: Owner): OpenProjectStatus {
  const c = credential(user.id, 'openproject')
  if (!c) return { connected: false, url: null, account: null }
  return {
    connected: true,
    url: (JSON.parse(c.secret) as Conn).url,
    account: c.account,
  }
}

export async function saveOpenProject(user: Owner, input: { url?: string; token?: string }) {
  const token = input.token?.trim()
  if (!token) throw new HttpError(400, 'Cole o token de API')
  const c = { url: baseUrl(input.url ?? ''), token }
  const res = await call(c, '/users/me')
  if (res.status === 401 || res.status === 403) throw new HttpError(400, 'O OpenProject recusou o token')
  if (!res.ok) throw new HttpError(400, `O OpenProject respondeu ${res.status}; confira o endereço`)
  const me = (await res.json().catch(() => null)) as {
    _type?: string
    name?: string
  } | null
  if (me?._type !== 'User') throw new HttpError(400, 'Esse endereço não parece ser de um OpenProject')
  saveCredential(user.id, 'openproject', JSON.stringify(c), me.name ?? 'conectado')
  metaCache.delete(user.id)
}

export function removeOpenProject(user: Owner) {
  dropCredential(user.id, 'openproject')
  metaCache.delete(user.id)
}

// --- Demandas (work packages) ---

type Link = { href: string | null; title?: string; payload?: unknown }
type Links = Record<string, Link | undefined>
type Collection<T> = {
  total: number
  pageSize: number
  _embedded: { elements: T[] }
}
type Formattable = { raw?: string | null } | null | undefined

type WorkPackage = {
  id: number
  subject: string
  description?: Formattable
  startDate?: string | null
  dueDate?: string | null
  date?: string | null
  percentageDone?: number | null
  lockVersion: number
  createdAt: string
  updatedAt: string
  _links: Links
}

const lastSegment = (href: string | null | undefined) => href?.split('/').pop() ?? ''

const ref = (l: Link | undefined): DemandaRef | null => (l?.href ? { id: lastSegment(l.href), name: l.title ?? '' } : null)

const person = (l: Link | undefined): DemandaRef | null => (l?.href ? { id: l.href, name: l.title ?? '' } : null)

const toDemanda = (base: string, w: WorkPackage): Demanda => ({
  id: w.id,
  subject: w.subject,
  project: ref(w._links.project),
  type: ref(w._links.type),
  status: ref(w._links.status),
  priority: ref(w._links.priority),
  assignee: person(w._links.assignee),
  responsible: person(w._links.responsible),
  // Marcos (milestones) têm só "date".
  startDate: w.startDate ?? w.date ?? null,
  dueDate: w.dueDate ?? w.date ?? null,
  percentDone: w.percentageDone ?? null,
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
  url: `${base}/work_packages/${w.id}`,
})

const META_TTL_MS = 10 * 60_000
const metaCache = new Map<string, { at: number; meta: DemandasMeta }>()

export async function demandasMeta(user: Owner): Promise<DemandasMeta> {
  const hit = metaCache.get(user.id)
  if (hit && Date.now() - hit.at < META_TTL_MS) return hit.meta
  type S = {
    id: number
    name: string
    isClosed: boolean
    color?: string | null
  }
  type R = { id: number; name: string }
  const [statuses, types, priorities, projects] = await Promise.all([
    op<Collection<S>>(user, '/statuses'),
    op<Collection<R>>(user, '/types'),
    op<Collection<R>>(user, '/priorities'),
    op<Collection<R>>(user, `/projects?pageSize=500&filters=${encodeURIComponent('[{"active":{"operator":"=","values":["t"]}}]')}`),
  ])
  const plain = (r: R): DemandaRef => ({ id: String(r.id), name: r.name })
  const meta: DemandasMeta = {
    statuses: statuses._embedded.elements.map((s): DemandaStatus => ({
      id: String(s.id),
      name: s.name,
      closed: s.isClosed,
      color: s.color ?? null,
    })),
    types: types._embedded.elements.map(plain),
    priorities: priorities._embedded.elements.map(plain),
    projects: projects._embedded.elements.map(plain).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  }
  metaCache.set(user.id, { at: Date.now(), meta })
  return meta
}

const PAGE_SIZE = 50

const SCOPE: Record<NonNullable<DemandaQuery['escopo']>, string | null> = {
  atribuidas: 'assignee',
  responsavel: 'responsible',
  observando: 'watcher',
  criadas: 'author',
  todas: null,
}

const SORT: Record<NonNullable<DemandaQuery['ordem']>, [string, 'asc' | 'desc']> = {
  atualizacao: ['updatedAt', 'desc'],
  prazo: ['dueDate', 'asc'],
  prioridade: ['priority', 'desc'],
  id: ['id', 'desc'],
  criacao: ['createdAt', 'desc'],
}

// Data local (sv-SE dá AAAA-MM-DD); toISOString usaria UTC.
const isoDay = (d: Date) => d.toLocaleDateString('sv-SE')

export async function listDemandas(user: Owner, q: DemandaQuery): Promise<DemandaPage> {
  const f: Record<string, { operator: string; values: string[] | null }>[] = []
  const scope = SCOPE[q.escopo ?? 'atribuidas']
  if (scope) f.push({ [scope]: { operator: '=', values: ['me'] } })
  if (q.status) f.push({ status: { operator: '=', values: [q.status] } })
  else
    f.push({
      status: {
        operator: q.situacao === 'fechadas' ? 'c' : q.situacao === 'todas' ? '*' : 'o',
        values: null,
      },
    })
  if (q.projeto) f.push({ project: { operator: '=', values: [q.projeto] } })
  if (q.tipo) f.push({ type: { operator: '=', values: [q.tipo] } })
  if (q.prioridade) f.push({ priority: { operator: '=', values: [q.prioridade] } })
  if (q.prazo === 'atrasadas')
    f.push({
      dueDate: {
        operator: '<>d',
        values: ['1970-01-01', isoDay(new Date(Date.now() - 86_400_000))],
      },
    })
  if (q.prazo === 'hoje') f.push({ dueDate: { operator: 't', values: [] } })
  if (q.prazo === 'semana') f.push({ dueDate: { operator: 'w', values: [] } })
  if (q.prazo === 'sem') f.push({ dueDate: { operator: '!*', values: [] } })
  const text = q.q?.trim() ?? ''
  // A busca do OpenProject não olha o número; "123" ou "#123" vira filtro por id.
  if (/^#?\d+$/.test(text)) f.push({ id: { operator: '=', values: [text.replace('#', '')] } })
  else if (text) f.push({ search: { operator: '**', values: [text] } })
  const params = new URLSearchParams({
    filters: JSON.stringify(f),
    sortBy: JSON.stringify([SORT[q.ordem ?? 'atualizacao']]),
    pageSize: String(PAGE_SIZE),
    offset: String(Math.max(1, Number(q.pagina) || 1)),
  })
  const r = await op<Collection<WorkPackage>>(user, `/work_packages?${params}`)
  return {
    items: r._embedded.elements.map((w) => toDemanda(conn(user)!.url, w)),
    total: r.total,
    pageSize: PAGE_SIZE,
  }
}

// Menções e imagens do OpenProject viram markdown que a tela sabe mostrar; imagens passam pelo daemon.
function cleanMarkdown(raw: string | null | undefined) {
  // O editor do OpenProject deixa <br> e &nbsp; soltos no markdown.
  return (raw ?? '')
    .replace(/<mention\b[^>]*>(.*?)<\/mention>/g, '**$1**')
    .replace(/\(([^)\s]*?)\/api\/v3\/attachments\/(\d+)\/content\)/g, '(/api/demandas/anexos/$2)')
    .replace(/^\s*<br\s*\/?>\s*$/gm, '')
    .replace(/<br\s*\/?>/g, '  \n')
    .replace(/&nbsp;/g, ' ')
}

const userNames = new Map<string, string>()

// Algumas instâncias mandam o link do usuário sem o nome (title); busca uma vez e guarda.
async function userName(user: Owner, l: Link | undefined) {
  if (!l?.href) return null
  if (l.title) return l.title
  const id = lastSegment(l.href)
  const key = `${conn(user)?.url}|${id}`
  if (!userNames.has(key)) {
    const u = await op<{ name?: string }>(user, `/users/${id}`).catch(() => null)
    userNames.set(key, u?.name ?? 'Usuário')
  }
  return userNames.get(key)!
}

type Activity = {
  id: number
  comment?: Formattable
  details?: Formattable[]
  createdAt: string
  _links: Links
}
type Attachment = {
  id: number
  fileName: string
  fileSize: number
  contentType: string
  createdAt: string
  _links: Links
}

export async function getDemanda(user: Owner, id: string): Promise<DemandaDetail> {
  numericId(id)
  const [w, acts, files] = await Promise.all([
    op<WorkPackage>(user, `/work_packages/${id}`),
    op<Collection<Activity>>(user, `/work_packages/${id}/activities`),
    op<Collection<Attachment>>(user, `/work_packages/${id}/attachments`),
  ])
  const activities = await Promise.all(
    acts._embedded.elements.map(async (a): Promise<DemandaActivity> => ({
      id: String(a.id),
      author: await userName(user, a._links.user),
      createdAt: a.createdAt,
      comment: cleanMarkdown(a.comment?.raw),
      // "Descrição alterado /journals/1/diff/description": o caminho só serve dentro do OpenProject.
      details: (a.details ?? []).map((d) => (d?.raw ?? '').replace(/\s*\(?\/journals\/\d+\/diff\/\S+$/, '')).filter(Boolean),
    })),
  )
  const attachments = files._embedded.elements.map((f): DemandaAttachment => ({
    id: String(f.id),
    fileName: f.fileName,
    size: f.fileSize,
    contentType: f.contentType,
    author: f._links.author?.title ?? null,
    createdAt: f.createdAt,
  }))
  return {
    ...toDemanda(conn(user)!.url, w),
    description: cleanMarkdown(w.description?.raw),
    author: w._links.author?.title ?? null,
    activities,
    attachments,
    lockVersion: w.lockVersion,
    can: {
      edit: !!(w._links.update ?? w._links.updateImmediately),
      comment: !!w._links.addComment,
      attach: !!w._links.addAttachment,
    },
    watching: w._links.unwatch ? true : w._links.watch ? false : null,
  }
}

const numericId = (id: string) => {
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Demanda não encontrada')
  return id
}

type SchemaField = {
  writable?: boolean
  _embedded?: {
    allowedValues?: { id?: number; name: string; _links: Links }[]
  }
  _links?: { allowedValues?: Link }
}

const SCHEMA_KEY: Record<DemandaField, string> = {
  status: 'status',
  priority: 'priority',
  assignee: 'assignee',
  responsible: 'responsible',
  startDate: 'startDate',
  dueDate: 'dueDate',
  percentDone: 'percentageDone',
}

// O formulário do OpenProject diz o que dá para editar agora e os valores permitidos (ex.: transições de status).
export async function demandaEditOptions(user: Owner, id: string): Promise<DemandaEditOptions> {
  const w = await op<WorkPackage>(user, `/work_packages/${numericId(id)}`)
  const form = await op<{
    _embedded: { schema: Record<string, SchemaField | undefined> }
  }>(user, `/work_packages/${id}/form`, {
    method: 'POST',
    body: { lockVersion: w.lockVersion },
  })
  const schema = form._embedded.schema
  const out: DemandaEditOptions = {}
  for (const [field, key] of Object.entries(SCHEMA_KEY) as [DemandaField, string][]) {
    // Marcos (milestones) têm "date" no lugar de início e prazo.
    const f = schema[key] ?? (field === 'dueDate' ? schema.date : undefined)
    if (!f?.writable) continue
    if (field === 'status' || field === 'priority') {
      out[field] = {
        options: (f._embedded?.allowedValues ?? []).map((v) => ({
          id: String(v.id ?? lastSegment(v._links.self?.href)),
          name: v.name,
        })),
      }
    } else if (field === 'assignee' || field === 'responsible') {
      const href = f._links?.allowedValues?.href
      const list = href ? await op<Collection<{ name: string; _links: Links }>>(user, `${href.replace(/^.*?\/api\/v3/, '')}${href.includes('?') ? '&' : '?'}pageSize=500`) : null
      out[field] = {
        options: (list?._embedded.elements ?? []).map((u) => ({ id: u._links.self!.href!, name: u.name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      }
    } else out[field] = {}
  }
  return out
}

const rel = (kind: string, id: string) => ({ href: `/api/v3/${kind}/${id}` })

export async function updateDemanda(user: Owner, id: string, p: DemandaPatch): Promise<DemandaDetail> {
  const w = await op<WorkPackage>(user, `/work_packages/${numericId(id)}`)
  const milestone = 'date' in w
  const body: Record<string, unknown> = { lockVersion: p.lockVersion }
  const links: Record<string, { href: string | null }> = {}
  if (p.status) links.status = rel('statuses', p.status)
  if (p.priority) links.priority = rel('priorities', p.priority)
  if (p.assignee !== undefined) links.assignee = { href: p.assignee }
  if (p.responsible !== undefined) links.responsible = { href: p.responsible }
  if (p.startDate !== undefined) body[milestone ? 'date' : 'startDate'] = p.startDate
  if (p.dueDate !== undefined) body[milestone ? 'date' : 'dueDate'] = p.dueDate
  if (p.percentDone !== undefined) body.percentageDone = p.percentDone
  if (Object.keys(links).length) body._links = links
  const c = conn(user)!
  const res = await call(c, `/work_packages/${id}`, { method: 'PATCH', body })
  if (res.status === 409) throw new HttpError(409, 'Alguém alterou esta demanda enquanto você editava. A tela foi atualizada; confira e tente de novo.')
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      message?: string
    } | null
    throw new HttpError(400, data?.message ?? `O OpenProject respondeu ${res.status}`)
  }
  return getDemanda(user, id)
}

export async function addDemandaComment(user: Owner, id: string, text: string) {
  if (!text.trim()) throw new HttpError(400, 'Escreva o comentário')
  await op(user, `/work_packages/${numericId(id)}/activities`, {
    method: 'POST',
    body: { comment: { raw: text } },
  })
}

export async function commentDemanda(user: Owner, id: string, text: string): Promise<DemandaDetail> {
  await addDemandaComment(user, id, text)
  return getDemanda(user, id)
}

export function demandaLink(user: Owner, id: string) {
  const c = conn(user)
  if (!c) throw new HttpError(400, 'Conecte o OpenProject na tela Conexões')
  return { id: numericId(id), url: `${c.url}/work_packages/${id}` }
}

export async function attachToDemanda(user: Owner, id: string, file: { fileName: string; contentType: string; data: string }): Promise<DemandaDetail> {
  const c = conn(user)
  if (!c) throw new HttpError(400, 'Conecte o OpenProject na tela Conexões')
  const form = new FormData()
  form.append('metadata', JSON.stringify({ fileName: file.fileName }))
  form.append(
    'file',
    new Blob([Buffer.from(file.data, 'base64')], {
      type: file.contentType || 'application/octet-stream',
    }),
    file.fileName,
  )
  let res: Response
  try {
    res = await fetch(`${c.url}/api/v3/work_packages/${numericId(id)}/attachments`, {
      method: 'POST',
      headers: { authorization: auth(c.token) },
      body: form,
      signal: AbortSignal.timeout(120_000),
    })
  } catch {
    throw new HttpError(502, `Não foi possível falar com o OpenProject em ${c.url}`)
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      message?: string
    } | null
    throw new HttpError(400, data?.message ?? `O OpenProject respondeu ${res.status}`)
  }
  return getDemanda(user, id)
}

// Usa os links watch/unwatch que o próprio OpenProject manda, já com o usuário certo.
export async function watchDemanda(user: Owner, id: string, watch: boolean): Promise<DemandaDetail> {
  const w = await op<WorkPackage>(user, `/work_packages/${numericId(id)}`)
  const l = watch ? w._links.watch : w._links.unwatch
  if (l?.href) {
    const path = l.href.replace(/^.*?\/api\/v3/, '')
    await op(user, path, watch ? { method: 'POST', body: l.payload ?? {} } : { method: 'DELETE' })
  }
  return getDemanda(user, id)
}

// O conteúdo do anexo exige o token, então a tela baixa por aqui.
export async function downloadAttachment(user: Owner, id: string) {
  const c = conn(user)
  if (!c) throw new HttpError(400, 'Conecte o OpenProject na tela Conexões')
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Anexo não encontrado')
  const res = await call(c, `/attachments/${id}/content`)
  if (!res.ok || !res.body) throw new HttpError(res.status === 404 ? 404 : 502, 'Não foi possível baixar o anexo')
  return res
}

// --- Notificações do OpenProject ---

type OpNotification = { id: number; reason: string; createdAt: string; _links: Links }

const REASONS: Record<string, string> = {
  mentioned: 'mencionou você',
  assigned: 'atribuiu a você',
  responsible: 'deixou você como responsável',
  watched: 'atualizou uma demanda que você observa',
  commented: 'comentou',
  created: 'criou',
  processed: 'atualizou',
  prioritized: 'mudou a prioridade',
  scheduled: 'mudou as datas',
  shared: 'compartilhou com você',
  reminder: 'lembrete',
}

const POLL_MS = 60_000
const UNREAD = encodeURIComponent(JSON.stringify([{ readIAN: { operator: '=', values: ['f'] } }]))

async function syncNotifications(user: Owner) {
  const page = await op<Collection<OpNotification>>(user, `/notifications?pageSize=100&filters=${UNREAD}`)
  let changed = false
  for (const n of page._embedded.elements) {
    const res = n._links.resource
    const wp = res?.href?.includes('/work_packages/') ? lastSegment(res.href) : null
    const actor = n._links.actor?.title
    const reason = n.reason === 'dateAlert' ? 'prazo chegando' : (REASONS[n.reason] ?? 'atualizou')
    const isNew = notify(user.id, {
      source: 'openproject',
      externalId: String(n.id),
      title: wp ? `#${wp} ${res?.title ?? ''}`.trim() : (res?.title ?? 'OpenProject'),
      body: actor && n.reason !== 'dateAlert' ? `${actor} ${reason}` : reason,
      link: wp ? `/demandas/${wp}` : undefined,
      createdAt: n.createdAt,
      // As que já estavam lá quando o studio conectou entram na lista sem disparar aviso.
      silent: Date.now() - Date.parse(n.createdAt) > 10 * 60_000,
    })
    changed ||= isNew
  }
  // Lidas aqui mas ainda não lá (o aviso ao OpenProject falhou): tenta de novo.
  const pending = readHere(user.id, 'openproject', page._embedded.elements.map((n) => String(n.id)))
  if (pending.length) await markNotificationsRead(user, pending)
  // Só dá para saber o que foi lido lá quando veio a lista inteira de não lidas.
  if (page.total <= page._embedded.elements.length)
    changed = syncRead(user.id, 'openproject', page._embedded.elements.map((n) => String(n.id))) || changed
  if (changed) refresh(user.id)
}

export function startNotificationPolling() {
  const failing = new Set<string>()
  const tick = async () => {
    const users = db.prepare("SELECT c.user_id AS id FROM credentials c JOIN users u ON u.id = c.user_id WHERE c.kind = 'openproject' AND u.disabled_at IS NULL").all() as Owner[]
    for (const u of users) {
      try {
        await syncNotifications(u)
        failing.delete(u.id)
      } catch (e) {
        // Avisa no log uma vez por queda, não a cada minuto.
        if (!failing.has(u.id)) console.warn(`Notificações do OpenProject (${u.id}): ${(e as Error).message}`)
        failing.add(u.id)
      }
    }
  }
  tick()
  setInterval(tick, POLL_MS)
}

export async function markNotificationsRead(user: Owner, externalIds: string[]) {
  // Sem corpo o OpenProject recusa com 406 (exige o content-type de JSON).
  for (const id of externalIds) await op(user, `/notifications/${id}/read_ian`, { method: 'POST', body: {} })
}
