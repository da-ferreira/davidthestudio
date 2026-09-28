import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import type { Improvement, Ticket, WorkspaceDetail } from '@studio/shared'
import { Topbar } from '@/components/topbar'
import { TicketForm, type TicketFormValues } from '@/components/ticket-form'
import { api } from '@/lib/api'

export function NovoTicket() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const melhoriaId = params.get('melhoria')
  const [ws, setWs] = useState<WorkspaceDetail | null>(null)
  // undefined: ainda carregando; null: sem melhoria de origem (parâmetro ausente ou não encontrada).
  const [initial, setInitial] = useState<TicketFormValues | null | undefined>(melhoriaId ? undefined : null)

  useEffect(() => {
    api<WorkspaceDetail>(`/workspaces/${id}`).then(setWs)
  }, [id])

  useEffect(() => {
    if (!melhoriaId) return
    api<Improvement[]>(`/workspaces/${id}/improvements`)
      .then((all) => {
        const i = all.find((x) => x.id === melhoriaId)
        setInitial(i ? { title: i.title, description: i.description } : null)
      })
      .catch(() => setInitial(null))
  }, [id, melhoriaId])

  if (initial === undefined) return <Topbar crumbs={[ws?.name ?? '…', 'Tickets', 'Novo']} />

  return (
    <>
      <Topbar crumbs={[ws?.name ?? '…', 'Tickets', 'Novo']} />
      <TicketForm
        key={melhoriaId}
        workspace={ws}
        initial={initial ?? undefined}
        layout="page"
        submitLabel="Criar e iniciar"
        busyLabel="Criando worktrees…"
        onCancel={() => navigate(`/w/${id}/tickets`)}
        onSubmit={async (body) => {
          const t = await api<Ticket>(`/workspaces/${id}/tickets`, { method: 'POST', body })
          if (melhoriaId) {
            // Best-effort: a melhoria pode ter sido apagada nesse meio-tempo; não desfaz o ticket criado.
            await api(`/workspaces/${id}/improvements/${melhoriaId}`, { method: 'PUT', body: { status: 'ticket', ticketId: t.id } }).catch(() => {})
          }
          navigate(`/w/${id}/tickets/${t.id}`)
        }}
      />
    </>
  )
}
