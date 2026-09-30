import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Check, ChevronRight, Code, Eye, FileText, Flag, ListChecks, Search, X } from 'lucide-react'
import type { Ticket, TicketStatus, Workspace } from '@studio/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Topbar } from '@/components/topbar'
import { TicketStatusBadge, agentLabel, isClosed } from '@/components/ticket-status'
import { stageIndex, stageLabel } from '@/components/stages'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const FILTERS: { id: string; label: string; statuses: TicketStatus[] | null }[] = [
  { id: 'todos', label: 'Todos', statuses: null },
  { id: 'andamento', label: 'Em andamento', statuses: ['running', 'waiting'] },
  { id: 'revisar', label: 'Para revisar', statuses: ['approval', 'done', 'error', 'interrupted'] },
  { id: 'encerrados', label: 'Encerrados', statuses: ['closed', 'discarded'] },
]

const COLUMNS = FILTERS.flatMap((f) => (f.statuses ? [{ ...f, statuses: f.statuses }] : []))

// Sem acento e sem caixa: "migracao" encontra "Migração".
const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

const durationLabel = (milliseconds: number | null) => {
  if (milliseconds === null) return '—'
  const seconds = Math.round(milliseconds / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  if (hours) return `${hours}h ${minutes}min`
  if (minutes) return remainder ? `${minutes}min ${remainder}s` : `${minutes}min`
  return `${seconds}s`
}

export function Tickets() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ws, setWs] = useState<Workspace | null>(null)
  const [items, setItems] = useState<Ticket[] | null>(null)
  const [params, setParams] = useSearchParams()
  const searchRef = useRef<HTMLInputElement>(null)
  const filter = FILTERS.find((f) => f.id === params.get('status')) ?? FILTERS[0]
  const q = params.get('q') ?? ''
  const term = norm(q)
  const matches = (t: Ticket) => !term || norm(t.title).includes(term) || norm(t.id).includes(term)
  const count = (f: (typeof FILTERS)[number]) =>
    items?.filter((t) => (!f.statuses || f.statuses.includes(t.status)) && matches(t)).length ?? 0
  const shown = items?.filter((t) => (!filter.statuses || filter.statuses.includes(t.status)) && matches(t))
  const view = params.get('view')
  // No quadro as colunas já são os grupos das abas, então só a busca filtra.
  const board = view === 'quadro'
  const flow = view === 'fluxo'
  const found = items?.filter(matches)

  // Muda só uma chave para a aba e a busca não se apagarem uma à outra.
  const setParam = (key: string, value: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  useEffect(() => {
    api<Workspace[]>('/workspaces').then((all) => setWs(all.find((w) => w.id === id) ?? null))
    api<Ticket[]>(`/workspaces/${id}/tickets`).then(setItems)
  }, [id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
      if (!searchRef.current) return
      e.preventDefault()
      searchRef.current.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const novo = <Button onClick={() => navigate(`/w/${id}/tickets/novo`)}>Novo ticket</Button>

  return (
    <>
      <Topbar crumbs={[ws?.name ?? '…', 'Tickets']} actions={novo} />
      <div className="flex flex-1 flex-col gap-8 px-8 py-7">
        <div className="flex items-center gap-3">
          <h1 className="text-[28px] font-medium tracking-[-0.025em]">Tickets</h1>
          {!!items?.length && (
            <Tabs className="ml-auto" value={board ? 'quadro' : flow ? 'fluxo' : 'lista'} onValueChange={(v) => setParam('view', v === 'lista' ? '' : v)}>
              <TabsList>
                <TabsTrigger value="lista">Lista</TabsTrigger>
                <TabsTrigger value="quadro">Quadro</TabsTrigger>
                <TabsTrigger value="fluxo">Fluxo</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
        {items?.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-16 text-center">
            <div className="font-medium">Nenhum ticket ainda</div>
            <p className="max-w-sm text-muted-foreground">Descreva o que o agente deve fazer e escolha os repositórios.</p>
            <div className="mt-2">{novo}</div>
          </div>
        )}
        {!!items?.length && (
          <div className="flex flex-col gap-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="Buscar tickets…"
                aria-label="Buscar tickets por título ou ID"
                className="h-10 rounded-[10px] pr-10 pl-9"
                value={q}
                onChange={(e) => setParam('q', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Escape') return
                  if (q) setParam('q', '')
                  else e.currentTarget.blur()
                }}
              />
              <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-[5px] border bg-background px-[5px] font-sans text-[10.5px] leading-[17px] text-muted-foreground">
                /
              </kbd>
            </div>
            {!board && (
              <Tabs value={filter.id} onValueChange={(v) => setParam('status', v === 'todos' ? '' : v)}>
                <TabsList>
                  {FILTERS.map((f) => (
                    <TabsTrigger key={f.id} value={f.id}>
                      {f.label}
                      <span className="text-muted-foreground">{count(f)}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
          </div>
        )}
        {!board && !!items?.length && shown?.length === 0 && (
          <p className="text-muted-foreground">{term ? `Nenhum ticket encontrado para "${q.trim()}".` : 'Nenhum ticket neste filtro.'}</p>
        )}
        {board && !!items?.length && found?.length === 0 && (
          <p className="text-muted-foreground">Nenhum ticket encontrado para "{q.trim()}".</p>
        )}
        {board && !!found?.length && (
          <div className="overflow-x-auto">
            <div className="grid auto-cols-[minmax(280px,1fr)] grid-flow-col gap-4">
              {COLUMNS.map((c) => {
                const cards = found.filter((t) => c.statuses.includes(t.status))
                return (
                  <div key={c.id} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-1 pb-1 font-medium">
                      {c.label}
                      <span className="text-muted-foreground">{cards.length}</span>
                    </div>
                    {cards.map((t) => (
                      <TicketCard key={t.id} ticket={t} workspaceId={id!} />
                    ))}
                    {cards.length === 0 && <p className="px-1 text-muted-foreground">Nenhum ticket</p>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {flow && !!shown?.length && <Flow tickets={shown} workspaceId={id!} />}
        {!board && !flow && !!shown?.length && (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24 pl-4">Ticket</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Repositórios</TableHead>
                  <TableHead>Autor</TableHead>
                  <TableHead>Agente</TableHead>
                  <TableHead className="text-right">PRs</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Última atualização</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => navigate(`/w/${id}/tickets/${t.id}`)}>
                    <TableCell className="pl-4 font-mono text-[12px] text-muted-foreground">
                      <Link to={`/w/${id}/tickets/${t.id}`}>{t.id}</Link>
                    </TableCell>
                    <TableCell className="w-full max-w-0 font-medium">
                      <Truncated text={t.title} />
                    </TableCell>
                    <TableCell className="max-w-[180px] text-muted-foreground">
                      <Truncated text={t.pickRepos ? 'o agente escolhe' : t.repos.join(', ')} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.author ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{agentLabel(t)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{Object.keys(t.prs).length || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{stageLabel(t.stage)}</TableCell>
                    <TableCell>
                      <TicketStatusBadge status={t.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{new Date(t.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{durationLabel(t.durationMs)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(t.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  )
}

function TicketCard({ ticket: t, workspaceId }: { ticket: Ticket; workspaceId: string }) {
  const navigate = useNavigate()
  const href = `/w/${workspaceId}/tickets/${t.id}`
  return (
    <div className="flex cursor-pointer flex-col gap-2 rounded-xl border bg-background p-3" onClick={() => navigate(href)}>
      <Link to={href} className="self-start font-mono text-[12px] text-muted-foreground">
        {t.id}
      </Link>
      <div className="line-clamp-2 font-medium">{t.title}</div>
      <div className="flex items-center gap-2">
        <TicketStatusBadge status={t.status} />
        <span className="text-muted-foreground">{stageLabel(t.stage)}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 text-[13px] text-muted-foreground">
        <Truncated text={t.pickRepos ? 'o agente escolhe' : t.repos.join(', ')} />
        <Truncated text={agentLabel(t)} />
        <span>{t.author ?? '—'}</span>
      </div>
    </div>
  )
}

const FLOW_STEPS = [
  { label: 'Spec', icon: FileText },
  { label: 'Plano', icon: ListChecks },
  { label: 'Implementação', icon: Code },
  { label: 'Revisão', icon: Eye },
  { label: 'Entregue', icon: Flag },
]

// Encerrado ou descartado já passou por todas as etapas; o resto está na etapa atual.
const flowIndex = (t: Ticket) => (isClosed(t) ? FLOW_STEPS.length - 1 : stageIndex(t.stage))

const FLOW_GRID = 'grid grid-cols-[minmax(240px,1.4fr)_repeat(5,minmax(130px,1fr))]'

// Modo Fluxo: as etapas formam o pipeline e cada ticket é uma linha que percorre esse pipeline.
function Flow({ tickets, workspaceId }: { tickets: Ticket[]; workspaceId: string }) {
  const navigate = useNavigate()
  return (
    <div className="overflow-x-auto rounded-2xl border bg-surface bg-[radial-gradient(var(--line-strong)_1px,transparent_1px)] bg-size-[18px_18px]">
      <div className="flex min-w-[980px] flex-col gap-1 p-5">
        <div className={cn(FLOW_GRID, 'mb-3')}>
          <div className="flex items-center px-3 text-[13px] text-muted-foreground">
            {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}
          </div>
          {FLOW_STEPS.map((s, i) => {
            const n = tickets.filter((t) => flowIndex(t) === i).length
            return (
              <div key={s.label} className="relative flex items-center justify-center">
                {i > 0 && <span className="absolute top-1/2 left-0 h-px w-1/2 bg-line-strong" />}
                {i < FLOW_STEPS.length - 1 && <span className="absolute top-1/2 right-0 h-px w-1/2 bg-line-strong" />}
                {i > 0 && <ChevronRight className="absolute top-1/2 left-0 size-3.5 -translate-x-1/2 -translate-y-1/2 text-faint" />}
                <div className="relative flex items-center gap-2 rounded-xl border bg-background px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,.04)]">
                  <span className="flex size-6 items-center justify-center rounded-md bg-muted text-subtle">
                    <s.icon className="size-3.5" />
                  </span>
                  <span className="font-medium">{s.label}</span>
                  <span className="text-muted-foreground tabular-nums">{n}</span>
                </div>
              </div>
            )
          })}
        </div>
        {tickets.map((t) => {
          const current = flowIndex(t)
          const href = `/w/${workspaceId}/tickets/${t.id}`
          return (
            <div key={t.id} className={cn(FLOW_GRID, 'group cursor-pointer rounded-xl py-1.5 hover:bg-background/70')} onClick={() => navigate(href)}>
              <div className="relative flex min-w-0 items-center">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-xl border bg-background px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,.04)] group-hover:border-line-strong">
                  <Link to={href} className="self-start font-mono text-[12px] text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                    {t.id}
                  </Link>
                  <Truncated text={t.title} />
                </div>
                <span className="h-px w-4 shrink-0 bg-line-strong" />
              </div>
              {FLOW_STEPS.map((s, i) => (
                <div key={s.label} className="relative flex items-center justify-center">
                  <Edge className="left-0" reached={i <= current} />
                  {i < FLOW_STEPS.length - 1 && <Edge className="right-0" reached={i < current} />}
                  <FlowStep ticket={t} index={i} current={current} />
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Edge({ reached, className }: { reached: boolean; className: string }) {
  return <span className={cn('absolute top-1/2 w-1/2', reached ? 'h-px bg-line-strong' : 'border-t border-dashed border-line-strong', className)} />
}

function FlowStep({ ticket: t, index, current }: { ticket: Ticket; index: number; current: number }) {
  const last = index === FLOW_STEPS.length - 1
  if (index < current || (last && t.status === 'closed'))
    return (
      <span className="relative flex size-6 items-center justify-center rounded-full border border-success/40 bg-success-soft text-success" title={last ? 'Encerrado' : 'Concluída'}>
        <Check className="size-3.5" strokeWidth={2.6} />
      </span>
    )
  if (last && t.status === 'discarded')
    return (
      <span className="relative flex size-6 items-center justify-center rounded-full border bg-muted text-muted-foreground" title="Descartado">
        <X className="size-3.5" strokeWidth={2.6} />
      </span>
    )
  if (index === current)
    return (
      <span className="relative flex items-center rounded-full bg-background">
        <TicketStatusBadge status={t.status} />
      </span>
    )
  return <span className="relative size-3 rounded-full border border-dashed border-line-strong bg-background" />
}

// Tooltip só quando o texto foi cortado.
function Truncated({ text }: { text: string }) {
  const [cut, setCut] = useState(false)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block truncate" onPointerEnter={(e) => setCut(e.currentTarget.scrollWidth > e.currentTarget.clientWidth)}>
          {text}
        </span>
      </TooltipTrigger>
      {cut && <TooltipContent className="max-w-[420px] whitespace-normal">{text}</TooltipContent>}
    </Tooltip>
  )
}
