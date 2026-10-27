import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import type { DemandaDetail, Improvement, Ticket, WorkspaceDetail } from '@studio/shared'
import { Topbar } from '@/components/topbar'
import { TicketForm, type TicketFormValues } from '@/components/ticket-form'
import { api } from '@/lib/api'

export function NovoTicket() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const melhoriaId = params.get('melhoria')
  const demandaId = params.get('demanda')
  const [ws, setWs] = useState<WorkspaceDetail | null>(null)
  // undefined: ainda carregando; null: sem melhoria de origem (parâmetro ausente ou não encontrada).
  const [initial, setInitial] = useState<TicketFormValues | null | undefined>(melhoriaId || demandaId ? undefined : null)

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

  useEffect(() => {
    if (!demandaId) return
    api<DemandaDetail>(`/demandas/${demandaId}`)
      .then((d) => {
        // O agente não acessa o OpenProject: as imagens viram uma nota e o link da demanda vai junto.
        const text = d.description.replace(/!\[([^\]]*)\]\(\/api\/demandas\/anexos\/\d+\)/g, (_, alt) => `(imagem na demanda${alt ? `: ${alt}` : ''})`).trim()
        setInitial({ title: d.subject, description: [text, `Demanda #${d.id} no OpenProject: ${d.url}`].filter(Boolean).join('\n\n') })
      })
      .catch(() => setInitial(null))
  }, [demandaId])

  if (initial === undefined) return <Topbar crumbs={[ws?.name ?? '…', 'Tickets', 'Novo']} />

  return (
    <>
      <Topbar crumbs={[ws?.name ?? '…', 'Tickets', 'Novo']} />
      <TicketForm
        key={melhoriaId ?? demandaId}
        workspace={ws}
        initial={initial ?? undefined}
        layout="page"
        submitLabel="Criar e iniciar"
        busyLabel="Criando worktrees…"
        onCancel={() => navigate(`/w/${id}/tickets`)}
        onSubmit={async (body) => {
          const t = await api<Ticket>(`/workspaces/${id}/tickets`, { method: 'POST', body: demandaId ? { ...body, demanda: demandaId } : body })
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
