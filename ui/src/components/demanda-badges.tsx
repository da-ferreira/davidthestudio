import type { DemandaRef, DemandasMeta } from '@studio/shared'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// As cores do OpenProject costumam ser pastel: ficam só na bolinha e no fundo, o texto continua escuro.
export function DemandaStatusBadge({ status, meta }: { status: DemandaRef | null; meta: DemandasMeta | null }) {
  if (!status) return <span className="text-subtle">—</span>
  const color = meta?.statuses.find((s) => s.id === status.id)?.color
  return (
    <Badge className="gap-1.5 bg-muted text-body" style={color ? { backgroundColor: `${color}2e` } : undefined}>
      <span className="size-2 rounded-full bg-current" style={color ? { backgroundColor: color } : undefined} />
      {status.name}
    </Badge>
  )
}

// Prioridade comum fica apagada; só as altas chamam atenção.
export function Priority({ priority }: { priority: DemandaRef | null }) {
  if (!priority) return <span className="text-subtle">—</span>
  const high = /alta|urgente|imediata|high|urgent|immediate/i.test(priority.name)
  const low = /baixa|low/i.test(priority.name)
  return <span className={cn(high ? 'font-medium text-warning' : low ? 'text-muted-foreground' : 'text-body')}>{priority.name}</span>
}

// Data local: em UTC, à noite no Brasil já seria o dia seguinte.
const today = () => new Date().toLocaleDateString('sv-SE')

const dayDiff = (a: string, b: string) => Math.round((new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86_400_000)

export const formatDate = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

// Sem o ano quando é o ano corrente: no dia a dia o que importa é o dia.
const shortDate = (iso: string) => (iso.slice(0, 4) === today().slice(0, 4) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : formatDate(iso))

// hintOnly: ao lado de um campo de data editável, a data já aparece no campo.
export function DueDate({ date, closed, hintOnly }: { date: string | null; closed: boolean; hintOnly?: boolean }) {
  if (!date) return <span className="text-subtle">—</span>
  const diff = dayDiff(date, today())
  const hint = closed ? null : diff < 0 ? `atrasada há ${-diff} d` : diff === 0 ? 'hoje' : diff === 1 ? 'amanhã' : diff < 7 ? `em ${diff} d` : null
  return (
    <span className={cn('tabular-nums', !closed && diff < 0 && 'font-medium text-danger', !closed && (diff === 0 || diff === 1) && 'font-medium text-warning', closed && 'text-muted-foreground')}>
      {!hintOnly && shortDate(date)}
      {hint && <span className={cn(diff > 1 && 'font-normal text-muted-foreground')}>{hintOnly ? hint : ` · ${hint}`}</span>}
    </span>
  )
}

// Em teste a demanda já saiu das mãos de quem desenvolve: o prazo vale como o de uma finalizada, sem aviso de atraso.
export const isDueDateSettled = (status: DemandaRef | null, meta: DemandasMeta | null) => {
  const s = status && meta?.statuses.find((x) => x.id === status.id)
  return !!s && (s.closed || s.testing)
}
