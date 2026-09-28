import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { Ticket, WorkspaceDetail } from '@studio/shared'
import { Topbar } from '@/components/topbar'
import { TicketForm } from '@/components/ticket-form'
import { api } from '@/lib/api'

export function NovoTicket() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ws, setWs] = useState<WorkspaceDetail | null>(null)

  useEffect(() => {
    api<WorkspaceDetail>(`/workspaces/${id}`).then(setWs)
  }, [id])

  return (
    <>
      <Topbar crumbs={[ws?.name ?? '…', 'Tickets', 'Novo']} />
      <TicketForm
        workspace={ws}
        layout="page"
        submitLabel="Criar e iniciar"
        busyLabel="Criando worktrees…"
        onCancel={() => navigate(`/w/${id}/tickets`)}
        onSubmit={async (body) => {
          const t = await api<Ticket>(`/workspaces/${id}/tickets`, { method: 'POST', body })
          navigate(`/w/${id}/tickets/${t.id}`)
        }}
      />
    </>
  )
}
