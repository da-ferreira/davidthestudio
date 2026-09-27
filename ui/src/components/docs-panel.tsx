import { useState } from 'react'
import { FileText } from 'lucide-react'
import type { DocStage, Ticket, TicketDocs } from '@studio/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Markdown } from '@/components/markdown'
import { isActive, isClosed } from '@/components/ticket-status'
import { stageIndex } from '@/components/stages'
import { ApiError, api } from '@/lib/api'

const DOC: Record<DocStage, { file: string; the: string; ready: string; approved: string; after: string }> = {
  spec: { file: 'spec.md', the: 'a spec', ready: 'pronta', approved: 'aprovada', after: '' },
  plan: { file: 'plan.md', the: 'o plano', ready: 'pronto', approved: 'aprovado', after: 'O plano vem depois da spec aprovada.' },
}

export function DocsPanel({ ticket, docs, onDocs }: { ticket: Ticket; docs: TicketDocs | null; onDocs: (d: TicketDocs) => void }) {
  return (
    <div className="-mr-8 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-8">
      {(['spec', 'plan'] as const).map((st) => (
        <DocCard key={st} ticket={ticket} stage={st} text={docs?.[st] ?? null} onDocs={onDocs} />
      ))}
    </div>
  )
}

function DocCard({ ticket, stage, text, onDocs }: { ticket: Ticket; stage: DocStage; text: string | null; onDocs: (d: TicketDocs) => void }) {
  const d = DOC[stage]
  const current = ticket.stage === stage
  const passed = stageIndex(ticket.stage) > stageIndex(stage)
  const editable = current && !!text && !isActive(ticket) && !isClosed(ticket)
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const act = (p: Promise<unknown>) => {
    setBusy(true)
    setError(null)
    p.catch((e) => setError(e instanceof ApiError ? e.message : 'Falhou')).finally(() => setBusy(false))
  }
  const save = () =>
    act(
      api<TicketDocs>(`/tickets/${ticket.id}/docs/${stage}`, { method: 'PUT', body: { content: draft } }).then((docs) => {
        onDocs(docs)
        setDraft(null)
      }),
    )
  const approve = () => act(api(`/tickets/${ticket.id}/approve`, { method: 'POST', body: { stage } }))

  let badge: React.ReactNode = null
  if (passed) badge = <Badge className="bg-success-soft text-success">{ticket.gates.includes(stage) ? d.approved : d.ready}</Badge>
  else if (current && ticket.status === 'approval') badge = <Badge className="bg-warning-soft text-warning">aguardando aprovação</Badge>
  else if (current && text) badge = <Badge className="bg-muted text-subtle">rascunho</Badge>

  return (
    <section className="flex flex-col gap-3 rounded-[14px] border border-line px-5 py-4">
      <div className="flex items-center gap-2.5">
        <FileText className="size-4 text-muted-foreground" />
        <span className="font-mono text-[13px]">{d.file}</span>
        {badge}
        {editable && draft === null && (
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setDraft(text)}>
              Editar
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => document.getElementById('composer')?.focus()}>
              Pedir ajuste
            </Button>
            <Button size="sm" disabled={busy} onClick={approve}>
              Aprovar
            </Button>
          </div>
        )}
        {draft !== null && (
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={busy || !draft.trim()} onClick={save}>
              Salvar
            </Button>
          </div>
        )}
      </div>
      {draft !== null ? (
        <Textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[360px] resize-y font-mono text-[12.5px] leading-relaxed"
        />
      ) : text ? (
        <Markdown text={text} />
      ) : (
        <p className="text-[13px] text-muted-foreground">
          {current ? `O agente ainda não escreveu ${d.the}.` : passed ? 'Sem documento nesta etapa.' : d.after}
        </p>
      )}
      {error && <span className="text-[13px] text-destructive">{error}</span>}
    </section>
  )
}
