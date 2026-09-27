import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import type { Ticket, TicketStatus, Workspace } from '@studio/shared'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

export function Tickets() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ws, setWs] = useState<Workspace | null>(null)
  const [items, setItems] = useState<Ticket[] | null>(null)
  const [params, setParams] = useSearchParams()
  const filter = FILTERS.find((f) => f.id === params.get('status')) ?? FILTERS[0]
  const count = (f: (typeof FILTERS)[number]) => items?.filter((t) => !f.statuses || f.statuses.includes(t.status)).length ?? 0
  const shown = items?.filter((t) => !filter.statuses || filter.statuses.includes(t.status))

  useEffect(() => {
    api<Workspace[]>('/workspaces').then((all) => setWs(all.find((w) => w.id === id) ?? null))
    api<Ticket[]>(`/workspaces/${id}/tickets`).then(setItems)
  }, [id])

  const novo = <Button onClick={() => navigate(`/w/${id}/tickets/novo`)}>Novo ticket</Button>

  return (
    <>
      <Topbar crumbs={[ws?.name ?? '…', 'Tickets']} actions={novo} />
      <div className="flex flex-1 flex-col gap-8 px-8 py-7">
        <h1 className="text-[28px] font-medium tracking-[-0.025em]">Tickets</h1>
        {items?.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-16 text-center">
            <div className="font-medium">Nenhum ticket ainda</div>
            <p className="max-w-sm text-muted-foreground">Descreva o que o agente deve fazer e escolha os repositórios.</p>
            <div className="mt-2">{novo}</div>
          </div>
        )}
        {!!items?.length && (
          <Tabs value={filter.id} onValueChange={(v) => setParams(v === 'todos' ? {} : { status: v }, { replace: true })}>
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
        {!!items?.length && shown?.length === 0 && <p className="text-muted-foreground">Nenhum ticket neste filtro.</p>}
        {!!shown?.length && (
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
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell className="text-muted-foreground">{t.pickRepos ? 'o agente escolhe' : t.repos.join(', ')}</TableCell>
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
