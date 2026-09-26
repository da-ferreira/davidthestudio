import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { Ticket, Workspace } from '@studio/shared'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Topbar } from '@/components/topbar'
import { TicketStatusBadge, modelLabel } from '@/components/ticket-status'
import { api } from '@/lib/api'

export function Tickets() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ws, setWs] = useState<Workspace | null>(null)
  const [items, setItems] = useState<Ticket[] | null>(null)

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
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24 pl-4">Ticket</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Repositórios</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Criado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => navigate(`/w/${id}/tickets/${t.id}`)}>
                    <TableCell className="pl-4 font-mono text-[12px] text-muted-foreground">
                      <Link to={`/w/${id}/tickets/${t.id}`}>{t.id}</Link>
                    </TableCell>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell className="text-muted-foreground">{t.repos.join(', ')}</TableCell>
                    <TableCell className="text-muted-foreground">{modelLabel(t.model)}</TableCell>
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
