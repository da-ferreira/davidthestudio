import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Play, Send, Square } from 'lucide-react'
import type { TestRun, TestStatus, Ticket, WorkspaceDetail } from '@studio/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { isActive, isClosed } from '@/components/ticket-status'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/utils'

const STATUS: Record<TestStatus, { label: string; className: string }> = {
  running: { label: 'Rodando', className: 'bg-blue-50 text-blue-700' },
  passed: { label: 'Passou', className: 'bg-green-50 text-green-700' },
  failed: { label: 'Falhou', className: 'bg-red-50 text-red-700' },
  stopped: { label: 'Parado', className: 'bg-neutral-100 text-neutral-600' },
  error: { label: 'Não terminou', className: 'bg-red-50 text-red-700' },
  interrupted: { label: 'Interrompido', className: 'bg-amber-50 text-amber-700' },
}

export function TestsPanel({ ticket, runs }: { ticket: Ticket; runs: TestRun[] }) {
  const [commands, setCommands] = useState<{ repo: string; test: string | null }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = runs.some((r) => r.status === 'running')

  useEffect(() => {
    api<WorkspaceDetail>(`/workspaces/${ticket.workspaceId}`).then((ws) =>
      setCommands(ticket.repos.map((repo) => ({ repo, test: ws.repos.find((r) => r.name === repo)?.test ?? null }))),
    )
  }, [ticket.workspaceId, ticket.repos])

  const act = (url: string) => {
    setBusy(true)
    setError(null)
    api(url, { method: 'POST' })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Falhou'))
      .finally(() => setBusy(false))
  }

  const hasCommand = !!commands?.some((c) => c.test)
  const newest = [...runs].reverse()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      <div className="flex items-start gap-4 rounded-[14px] border border-[#efefef] px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {commands?.map((c) => (
            <div key={c.repo} className="flex items-baseline gap-3 text-[13px]">
              <span className="w-40 shrink-0 truncate font-medium">{c.repo}</span>
              {c.test ? (
                <span className="truncate font-mono text-[12.5px]">{c.test}</span>
              ) : (
                <span className="text-muted-foreground">sem comando de teste</span>
              )}
            </div>
          ))}
          {commands && !hasCommand && (
            <span className="text-[13px] text-muted-foreground">Configure o comando na tela Repositórios, no botão de ajustes do repositório.</span>
          )}
          {error && <span className="text-[13px] text-destructive">{error}</span>}
        </div>
        {running ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(`/tickets/${ticket.id}/tests/stop`)}>
            <Square className="fill-current" />
            Parar testes
          </Button>
        ) : (
          !isClosed(ticket) && (
            <Button
              size="sm"
              disabled={busy || !hasCommand || isActive(ticket)}
              title={isActive(ticket) ? 'Espere o agente terminar' : undefined}
              onClick={() => act(`/tickets/${ticket.id}/tests`)}
            >
              <Play />
              Rodar testes
            </Button>
          )
        )}
      </div>
      {!runs.length && <p className="px-1 text-[13px] text-muted-foreground">Nenhum teste rodou neste ticket ainda.</p>}
      {newest.map((run, i) => (
        <RunCard
          key={run.id}
          run={run}
          newest={i === 0}
          onSend={
            (run.status === 'failed' || run.status === 'error') && !running && !isActive(ticket) && !isClosed(ticket)
              ? () => act(`/tickets/${ticket.id}/tests/${run.id}/send`)
              : undefined
          }
        />
      ))}
    </div>
  )
}

function RunCard({ run, newest, onSend }: { run: TestRun; newest: boolean; onSend?: () => void }) {
  const [open, setOpen] = useState(newest)
  const out = useRef<HTMLPreElement>(null)
  const s = STATUS[run.status]

  // Acompanha o fim da saída enquanto roda, a menos que o usuário tenha subido para ler.
  useEffect(() => {
    const el = out.current
    if (el && run.status === 'running' && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight
  }, [run.output, run.status])
  useEffect(() => {
    if (!newest) setOpen(false)
  }, [newest])
  useEffect(() => {
    if (open && out.current) out.current.scrollTop = out.current.scrollHeight
  }, [open])

  return (
    <section className="flex flex-col rounded-[14px] border border-[#efefef]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 px-5 py-3.5 text-left">
        <ChevronRight className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <span className="font-medium">{run.repo}</span>
        <span className="truncate font-mono text-[12.5px] text-muted-foreground">{run.command}</span>
        <Badge className={s.className}>{s.label}</Badge>
        <span className="ml-auto shrink-0 text-[12.5px] text-muted-foreground">
          {new Date(run.startedAt).toLocaleTimeString('pt-BR')}
          {run.finishedAt && ` · ${duration(run)}`}
          {run.exitCode !== null && run.exitCode !== 0 && ` · código ${run.exitCode}`}
        </span>
      </button>
      {open && (
        <div className="mx-5 mb-4 flex flex-col gap-3">
          <pre
            ref={out}
            className="max-h-[440px] overflow-auto rounded-[10px] border border-[#efefef] bg-[#fafafa] px-3.5 py-3 font-mono text-[12px] leading-[1.6] break-words whitespace-pre-wrap text-neutral-800"
          >
            {run.output || (run.status === 'running' ? 'Iniciando…' : 'Sem saída.')}
          </pre>
          {onSend && (
            <div className="flex items-center justify-end gap-3">
              <span className="text-[12.5px] text-muted-foreground">
                O agente recebe o fim desta saída e tenta corrigir; os testes rodam de novo quando ele terminar.
              </span>
              <Button size="sm" variant="outline" onClick={onSend}>
                <Send />
                Mandar para o agente
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function duration(run: TestRun) {
  const secs = Math.round((Date.parse(run.finishedAt!) - Date.parse(run.startedAt)) / 1000)
  return secs < 60 ? `${secs} s` : `${Math.floor(secs / 60)} min ${secs % 60} s`
}
