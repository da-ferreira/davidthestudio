import type { Ticket, TicketStatus } from '@studio/shared'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS: Record<TicketStatus, { label: string; className: string }> = {
  running: { label: 'Rodando', className: 'bg-blue-50 text-blue-700' },
  waiting: { label: 'Aguardando você', className: 'bg-amber-50 text-amber-700' },
  approval: { label: 'Aguardando aprovação', className: 'bg-amber-50 text-amber-700' },
  done: { label: 'Concluído', className: 'bg-green-50 text-green-700' },
  error: { label: 'Erro', className: 'bg-red-50 text-red-700' },
  interrupted: { label: 'Parado', className: 'bg-neutral-100 text-neutral-600' },
  closed: { label: 'Encerrado', className: 'bg-neutral-100 text-neutral-600' },
  discarded: { label: 'Descartado', className: 'bg-neutral-100 text-neutral-500' },
}

// Apelidos do Claude ficam com maiúscula; ids de versão (claude-opus-5) aparecem como estão.
const modelLabel = (id: string) => (/^[a-z]+$/.test(id) ? id[0].toUpperCase() + id.slice(1) : id)

export const agentLabel = (t: Pick<Ticket, 'agent' | 'model'>) =>
  t.agent === 'codex' ? `Codex · ${t.model || 'padrão da conta'}` : `Claude Code · ${modelLabel(t.model)}`

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const s = STATUS[status]
  return (
    <Badge className={cn('gap-1.5', s.className)}>
      <span className={cn('size-1.5 rounded-full bg-current', (status === 'running' || status === 'waiting') && 'animate-pulse')} />
      {s.label}
    </Badge>
  )
}

export const isActive = (t: Ticket) => t.status === 'running' || t.status === 'waiting'
export const isClosed = (t: Ticket) => t.status === 'closed' || t.status === 'discarded'
