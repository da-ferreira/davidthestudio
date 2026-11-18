import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, CircleDot, FileText, GitPullRequest, MessageCircleQuestion, Plus, Search, ShieldCheck } from 'lucide-react'
import type { DemandaPage, DemandasMeta, Ticket, Workspace } from '@studio/shared'
import { DueDate, isDueDateSettled } from '@/components/demanda-badges'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

// Janelinha do ícone no topo do Mac: busca, o que precisa de você e criação rápida.
// Os links abrem com window.open; o app do Mac intercepta e mostra na janela principal.

type WsTicket = Ticket & { workspaceName: string }
type Item = { key: string; icon: ReactNode; title: string; hint: ReactNode; link: string }
type Section = { title: string; items: Item[] }

const PENDING: Partial<Record<Ticket['status'], { label: string; icon: ReactNode }>> = {
  waiting: { label: 'Esperando sua resposta', icon: <MessageCircleQuestion className="text-warning" /> },
  approval: { label: 'Aguardando aprovação', icon: <ShieldCheck className="text-warning" /> },
  error: { label: 'Parou com erro', icon: <AlertCircle className="text-danger" /> },
  done: { label: 'Diff pronto para revisar', icon: <GitPullRequest className="text-success" /> },
}

const ticketItem = (t: WsTicket, hint?: string): Item => ({
  key: `t-${t.id}`,
  icon: PENDING[t.status]?.icon ?? <CircleDot className="text-muted-foreground" />,
  title: t.title,
  hint: `${t.workspaceName} · ${hint ?? PENDING[t.status]?.label ?? 'Ticket'}`,
  link: `/w/${t.workspaceId}/tickets/${t.id}`,
})

export function Rapido() {
  const [query, setQuery] = useState('')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [tickets, setTickets] = useState<WsTicket[]>([])
  const [abertas, setAbertas] = useState<DemandaPage['items']>([])
  const [meta, setMeta] = useState<DemandasMeta | null>(null)
  const [found, setFound] = useState<DemandaPage['items']>([])
  const [selected, setSelected] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const all = await api<Workspace[]>('/workspaces').catch(() => [])
    setWorkspaces(all)
    const per = await Promise.all(all.map((w) => api<Ticket[]>(`/workspaces/${w.id}/tickets`).then((ts) => ts.map((t) => ({ ...t, workspaceName: w.name })), () => [])))
    setTickets(per.flat().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    // Sem OpenProject conectado as demandas só não aparecem.
    const [m, page] = await Promise.all([api<DemandasMeta>('/demandas/meta').catch(() => null), api<DemandaPage>('/demandas?ordem=prazo').catch(() => null)])
    setMeta(m)
    setAbertas(page?.items ?? [])
  }, [])

  // O app esconde a janela em vez de fechar; a cada vez que ela volta, recomeça do zero.
  useEffect(() => {
    const reset = () => {
      setQuery('')
      setSelected(0)
      input.current?.focus()
      load()
    }
    reset()
    window.addEventListener('studio-quick-show', reset)
    return () => window.removeEventListener('studio-quick-show', reset)
  }, [load])

  useEffect(() => {
    const q = query.trim()
    if (!q) return setFound([])
    let stale = false
    const t = setTimeout(() => {
      api<DemandaPage>(`/demandas?${new URLSearchParams({ q, escopo: 'todas', situacao: 'todas' })}`)
        .then((p) => !stale && setFound(p.items.slice(0, 8)))
        .catch(() => !stale && setFound([]))
    }, 250)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [query])

  const q = query.trim()
  const demandaItem = (d: DemandaPage['items'][number]): Item => ({
    key: `d-${d.id}`,
    icon: <FileText className="text-muted-foreground" />,
    title: d.subject,
    hint: (
      <>
        #{d.id}
        {d.project && ` · ${d.project.name}`}
        {d.status && ` · ${d.status.name}`}
        {d.dueDate && (
          <>
            {' · '}
            <DueDate date={d.dueDate} closed={isDueDateSettled(d.status, meta)} />
          </>
        )}
      </>
    ),
    link: `/demandas/${d.id}`,
  })

  const sections: Section[] = q
    ? [
        {
          title: 'Criar',
          items: workspaces.map((w) => ({
            key: `n-${w.id}`,
            icon: <Plus className="text-muted-foreground" />,
            title: `Novo ticket: ${q}`,
            hint: w.name,
            link: `/w/${w.id}/tickets/novo?${new URLSearchParams({ titulo: q })}`,
          })),
        },
        {
          title: 'Tickets',
          items: tickets
            .filter((t) => t.status !== 'discarded' && (t.title.toLowerCase().includes(q.toLowerCase()) || t.id === q))
            .slice(0, 8)
            .map((t) => ticketItem(t, PENDING[t.status]?.label ?? (t.status === 'closed' ? 'Encerrado' : 'Ticket'))),
        },
        { title: 'Demandas', items: found.map(demandaItem) },
      ]
    : [
        { title: 'Precisa de você', items: tickets.filter((t) => PENDING[t.status]).map((t) => ticketItem(t)) },
        { title: 'Demandas abertas', items: abertas.map(demandaItem) },
      ]
  const visible = sections.filter((s) => s.items.length)
  const items = visible.flatMap((s) => s.items)
  const current = Math.min(selected, Math.max(items.length - 1, 0))

  useEffect(() => {
    list.current?.querySelector('[data-selected]')?.scrollIntoView({ block: 'nearest' })
  }, [current])

  const open = (link: string) => window.open(link, '_blank')

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const d = e.key === 'ArrowDown' ? 1 : -1
      setSelected((current + d + items.length) % Math.max(items.length, 1))
    }
    if (e.key === 'Enter' && items[current]) open(items[current].link)
  }

  return (
    <div className="flex h-screen flex-col bg-background text-sm" onKeyDown={onKeyDown}>
      <div className="flex items-center gap-2.5 border-b border-border px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={input}
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected(0)
          }}
          placeholder="Buscar demandas e tickets, ou digitar um novo ticket…"
          className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle"
        />
      </div>

      <div ref={list} className="flex-1 overflow-y-auto p-2">
        {visible.length === 0 && <p className="px-3 py-10 text-center text-muted-foreground">{q ? 'Nada encontrado.' : 'Nada pendente agora.'}</p>}
        {visible.map((s) => (
          <div key={s.title} className="mb-1">
            <div className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">{s.title}</div>
            {s.items.map((it) => {
              const i = items.indexOf(it)
              return (
                <button
                  key={it.key}
                  type="button"
                  data-selected={i === current || undefined}
                  onMouseMove={() => i !== current && setSelected(i)}
                  onClick={() => open(it.link)}
                  className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2 text-left [&_svg]:size-4 [&_svg]:shrink-0', i === current && 'bg-surface-2')}
                >
                  {it.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{it.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{it.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span>↑↓ navegar</span>
        <span>↵ abrir</span>
        <span>esc fechar</span>
        <button type="button" onClick={() => open('/')} className="ml-auto font-medium text-foreground hover:underline">
          Abrir studio
        </button>
      </div>
    </div>
  )
}
