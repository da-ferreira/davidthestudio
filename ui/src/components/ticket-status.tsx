import type { Ticket, TicketStatus } from '@studio/shared'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS: Record<TicketStatus, { label: string; className: string }> = {
  running: { label: 'Rodando', className: 'bg-info-soft text-info' },
  waiting: { label: 'Aguardando você', className: 'bg-warning-soft text-warning' },
  approval: { label: 'Aguardando aprovação', className: 'bg-warning-soft text-warning' },
  done: { label: 'Concluído', className: 'bg-success-soft text-success' },
  error: { label: 'Erro', className: 'bg-danger-soft text-danger' },
  interrupted: { label: 'Parado', className: 'bg-muted text-subtle' },
  closed: { label: 'Encerrado', className: 'bg-muted text-subtle' },
  discarded: { label: 'Descartado', className: 'bg-muted text-muted-foreground' },
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
