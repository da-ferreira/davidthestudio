import { useEffect, useState } from 'react'
import { ChevronRight, ExternalLink, GitCommitHorizontal, TriangleAlert } from 'lucide-react'
import type { FileChange, RepoDiff, TestWarning, Ticket } from '@studio/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isActive, isClosed } from '@/components/ticket-status'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/utils'

const WARNING: Record<TestWarning['reason'], string> = {
  never: 'os testes não rodaram',
  failed: 'o último teste não passou',
  stale: 'o código mudou depois do último teste',
}

export function DiffPanel({ ticket }: { ticket: Ticket }) {
  const [diffs, setDiffs] = useState<RepoDiff[] | null>(null)
  const [message, setMessage] = useState(ticket.title)
  const [busy, setBusy] = useState<'commit' | 'pr' | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [warnings, setWarnings] = useState<TestWarning[] | null>(null)

  const load = () =>
    api<RepoDiff[]>(`/tickets/${ticket.id}/diff`)
      .then(setDiffs)
      .catch((e) => setError(e))

  useEffect(() => {
    load()
  }, [ticket.id, ticket.status])

  // O agente deixa a mensagem sugerida ao fim de cada turno; sem ela, fica o título.
  useEffect(() => {
    if (isActive(ticket)) return
    api<{ message: string | null }>(`/tickets/${ticket.id}/commit`)
      .then((r) => r.message && setMessage(r.message))
      .catch(() => {})
  }, [ticket.id, ticket.status])

  const act = (kind: 'commit' | 'pr') => {
    setBusy(kind)
    setError(null)
    setWarnings(null)
    api<RepoDiff[]>(`/tickets/${ticket.id}/${kind}`, { method: 'POST', body: kind === 'commit' ? { message } : {} })
      .then(setDiffs)
      // Parte pode ter dado certo (ex.: push ok, PR falhou); recarrega para mostrar o estado real.
      .catch((e) => {
        setError(e)
        load()
      })
      .finally(() => setBusy(null))
  }

  // Avisa, sem bloquear: o humano pode commitar mesmo com teste falhando ou desatualizado.
  const commit = () => {
    setBusy('commit')
    setError(null)
    api<TestWarning[]>(`/tickets/${ticket.id}/tests/warnings`)
      .then((w) => {
        if (!w.length) return act('commit')
        setWarnings(w)
        setBusy(null)
      })
      .catch((e) => {
        setError(e)
        setBusy(null)
      })
  }

  const active = isActive(ticket)
  const uncommitted = diffs?.reduce((n, d) => n + d.uncommitted, 0) ?? 0
  const canPr = diffs?.some((d) => d.commits.length && (d.unpushed || !d.pr))
  const hasPr = diffs?.some((d) => d.pr)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {isClosed(ticket) ? (
        <span className="text-[12.5px] text-muted-foreground">Diff gravado quando o ticket foi encerrado.</span>
      ) : (
        <div className="flex flex-col gap-2 rounded-[14px] border border-line px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Mensagem do commit" className="flex-1" />
            <Button disabled={active || !uncommitted || !message.trim() || !!busy} onClick={commit}>
              <GitCommitHorizontal />
              {busy === 'commit' ? 'Commitando…' : 'Commitar'}
            </Button>
            <Button variant="outline" disabled={active || !canPr || !!busy} onClick={() => act('pr')}>
              {busy === 'pr' ? 'Enviando…' : hasPr ? 'Enviar commits' : 'Abrir PR'}
            </Button>
          </div>
          <span className="text-[12.5px] text-muted-foreground">
            {active
              ? 'O agente está trabalhando; espere ele terminar ou pare para commitar.'
              : uncommitted
                ? `${uncommitted} arquivo(s) sem commit. O commit sai com o seu nome e e-mail do studio e o ${ticket.agent === 'codex' ? 'Codex' : 'Claude'} como coautor, com o modelo que rodou.`
                : 'Tudo commitado.'}
          </span>
          {warnings && (
            <div className="flex items-start gap-3 rounded-[10px] bg-warning-soft px-3.5 py-3 text-[13px] text-amber-900 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <div className="flex flex-1 flex-col gap-0.5">
                {warnings.map((w) => (
                  <span key={w.repo}>
                    <span className="font-medium">{w.repo}</span>: {WARNING[w.reason]}
                  </span>
                ))}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setWarnings(null)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => act('commit')}>
                Commitar mesmo assim
              </Button>
            </div>
          )}
          {error && (
            <div className="text-[13px] text-destructive">
              {error.message}
              {error.reasons?.map((r) => (
                <pre key={r} className="mt-1 font-mono text-[12px] whitespace-pre-wrap">
                  {r}
                </pre>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="-mr-8 flex min-h-0 flex-1 flex-col gap-6 overflow-auto pr-8">
        {diffs === null && !error && <span className="text-muted-foreground">Carregando…</span>}
        {diffs?.map((d) => (
          <RepoSection key={d.repo} diff={d} />
        ))}
      </div>
    </div>
  )
}

function RepoSection({ diff }: { diff: RepoDiff }) {
  const add = diff.files.reduce((n, f) => n + f.additions, 0)
  const del = diff.files.reduce((n, f) => n + f.deletions, 0)
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[13px] font-medium">{diff.repo}</span>
        <span className="text-[13px] text-muted-foreground">
          a partir de <span className="font-mono">{diff.base}</span> · {diff.files.length} arquivo(s)
        </span>
        <span className="font-mono text-[12.5px] text-success">+{add}</span>
        <span className="font-mono text-[12.5px] text-red-600 dark:text-red-400">−{del}</span>
        {diff.pr && (
          <a href={diff.pr} target="_blank" rel="noreferrer" className="ml-auto">
            <Badge variant="outline" className="h-6 gap-1.5 font-normal">
              PR aberto
              <ExternalLink />
            </Badge>
          </a>
        )}
      </div>
      {diff.commits.length > 0 && (
        <div className="flex flex-col gap-1 text-[13px]">
          {diff.commits.map((c) => (
            <div key={c.sha} className="flex gap-2.5">
              <span className="font-mono text-muted-foreground">{c.sha}</span>
              <span>{c.subject}</span>
            </div>
          ))}
          {diff.unpushed > 0 && <span className="text-[12.5px] text-warning">{diff.unpushed} commit(s) ainda não enviados</span>}
        </div>
      )}
      {diff.files.length === 0 && <span className="text-[13px] text-muted-foreground">Sem mudanças.</span>}
      {diff.files.map((f) => (
        <FileBlock key={f.path} file={f} />
      ))}
    </section>
  )
}

const STATUS_LABEL = { A: 'novo', M: 'alterado', D: 'removido' }

function FileBlock({ file }: { file: FileChange }) {
  const [open, setOpen] = useState(true)
  const lines = file.patch.split('\n')
  const body = lines.slice(
    Math.max(
      0,
      lines.findIndex((l) => l.startsWith('@@')),
    ),
  )

  return (
    <div className="overflow-hidden rounded-[12px] border border-line">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2.5 bg-surface px-3 py-2 text-left">
        <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <span className="font-mono text-[12.5px]">{file.path}</span>
        <Badge variant="outline" className="font-normal">
          {STATUS_LABEL[file.status] ?? file.status}
        </Badge>
        <span className="ml-auto font-mono text-[12px] text-success">+{file.additions}</span>
        <span className="font-mono text-[12px] text-red-600 dark:text-red-400">−{file.deletions}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto py-1 font-mono text-[12px] leading-[1.6]">
          {file.patch ? (
            body.map((l, i) => (
              <div
                key={i}
                className={cn(
                  'px-3',
                  l.startsWith('+') && 'bg-success-soft text-green-900 dark:text-green-200',
                  l.startsWith('-') && 'bg-danger-soft text-red-900 dark:text-red-200',
                  l.startsWith('@@') && 'text-info/70',
                )}
              >
                {l || ' '}
              </div>
            ))
          ) : (
            <div className="px-3 text-muted-foreground">Arquivo binário</div>
          )}
        </pre>
      )}
    </div>
  )
}
