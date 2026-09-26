import { Fragment } from 'react'
import { Check } from 'lucide-react'
import type { Stage, Ticket, TicketDocs } from '@studio/shared'
import { isClosed } from '@/components/ticket-status'
import { cn } from '@/lib/utils'

const STAGES: { id: Stage; label: string }[] = [
  { id: 'spec', label: 'Spec' },
  { id: 'plan', label: 'Plano' },
  { id: 'implement', label: 'Implementação' },
  { id: 'review', label: 'Revisão' },
]

export const stageLabel = (st: Stage) => STAGES.find((s) => s.id === st)!.label

export const stageIndex = (st: Stage) => STAGES.findIndex((s) => s.id === st)

// Ticket rápido (ou anterior às etapas) não tem spec: o stepper começa na implementação.
export const hasSdd = (t: Ticket, docs: TicketDocs | null) => !!docs?.spec || t.stage === 'spec' || t.stage === 'plan'

export function planProgress(plan: string | null) {
  const items = plan?.match(/^\s*[-*] \[[ xX]\]/gm) ?? []
  if (!items.length) return null
  return { done: items.filter((i) => /\[[xX]\]/.test(i)).length, total: items.length }
}

export function StageStepper({ ticket, docs }: { ticket: Ticket; docs: TicketDocs | null }) {
  const steps = hasSdd(ticket, docs) ? STAGES : STAGES.slice(2)
  const current = isClosed(ticket) ? steps.length : steps.findIndex((s) => s.id === ticket.stage)
  const progress = planProgress(docs?.plan ?? null)

  return (
    <div className="flex items-center gap-2 text-[13px]">
      {steps.map((s, i) => {
        const done = i < current
        const now = i === current
        return (
          <Fragment key={s.id}>
            {i > 0 && <span className={cn('h-px w-6', done || now ? 'bg-neutral-400' : 'bg-[#e5e5e5]')} />}
            <span className={cn('flex items-center gap-1.5', done || now ? 'text-foreground' : 'text-muted-foreground')}>
              <span
                className={cn(
                  'flex size-[18px] items-center justify-center rounded-full border text-[11px]',
                  done && 'border-neutral-900 bg-neutral-900 text-white',
                  now && 'border-neutral-900 font-medium',
                  !done && !now && 'border-[#e5e5e5]',
                )}
              >
                {done ? <Check className="size-3" strokeWidth={2.6} /> : i + 1}
              </span>
              <span className={cn(now && 'font-medium')}>{s.label}</span>
              {s.id === 'implement' && progress && (done || now) && (
                <span className="text-muted-foreground">
                  {progress.done}/{progress.total}
                </span>
              )}
            </span>
          </Fragment>
        )
      })}
    </div>
  )
}
