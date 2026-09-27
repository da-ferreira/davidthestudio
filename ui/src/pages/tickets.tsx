import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Search } from 'lucide-react'
import type { Ticket, TicketStatus, Workspace } from '@studio/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Topbar } from '@/components/topbar'
import { TicketStatusBadge, agentLabel } from '@/components/ticket-status'
import { stageLabel } from '@/components/stages'
import { api } from '@/lib/api'

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
  // No quadro as colunas já são os grupos das abas, então só a busca filtra.
  const board = params.get('view') === 'quadro'
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
            <Tabs className="ml-auto" value={board ? 'quadro' : 'lista'} onValueChange={(v) => setParam('view', v === 'quadro' ? v : '')}>
              <TabsList>
                <TabsTrigger value="lista">Lista</TabsTrigger>
                <TabsTrigger value="quadro">Quadro</TabsTrigger>
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
        {!board && !!shown?.length && (
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
