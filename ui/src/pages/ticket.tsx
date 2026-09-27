import { type PointerEvent, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { ArrowUp, FileDiff, FileText, FlaskConical, GitBranch, PanelRightClose, PanelRightOpen, ShieldQuestion, Square, SquareTerminal } from 'lucide-react'
import type { AgentEvent, Ask, Reply, TestRun, Ticket as TicketT, TicketDocs, TicketEvent, Workspace, WsMessage } from '@studio/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Topbar } from '@/components/topbar'
import { DiffPanel } from '@/components/diff-panel'
import { DocsPanel } from '@/components/docs-panel'
import { TestsPanel } from '@/components/tests-panel'
import { StageStepper, hasSdd } from '@/components/stages'
import { Markdown } from '@/components/markdown'
import { CloseTicketButton } from '@/components/close-ticket'
import { TicketStatusBadge, isActive, isClosed, agentLabel } from '@/components/ticket-status'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/utils'

const TABS = ['spec', 'log', 'diff', 'testes']

export function Ticket() {
  const { id, ticketId } = useParams()
  const [ws, setWs] = useState<Workspace | null>(null)
  const [ticket, setTicket] = useState<TicketT | null>(null)
  const [events, setEvents] = useState<TicketEvent[]>([])
  const [runs, setRuns] = useState<TestRun[]>([])
  const [error, setError] = useState<string | null>(null)
  const [docs, setDocs] = useState<TicketDocs | null>(null)

  // O agente escreve spec.md e plan.md com ferramentas; relê a cada resultado de ferramenta ou mudança de etapa.
  const docsKey = events.filter((e) => e.event.type === 'tool_result' || e.event.type === 'note').length
  useEffect(() => {
    api<TicketDocs>(`/tickets/${ticketId}/docs`).then(setDocs, () => {})
  }, [ticketId, ticket?.status, ticket?.stage, docsKey])

  useEffect(() => {
    api<Workspace[]>('/workspaces').then((all) => setWs(all.find((w) => w.id === id) ?? null))
  }, [id])

  useEffect(() => {
    setEvents([])
    setRuns([])
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const sock = new WebSocket(`${proto}://${location.host}/ws/tickets/${ticketId}`)
    sock.onmessage = (msg) => {
      const m = JSON.parse(msg.data) as WsMessage
      if (m.kind === 'ticket') setTicket(m.ticket)
      else if (m.kind === 'event') setEvents((es) => [...es, m.event])
      else if (m.kind === 'test') setRuns((rs) => (rs.some((r) => r.id === m.run.id) ? rs.map((r) => (r.id === m.run.id ? m.run : r)) : [...rs, m.run]))
      else if (m.kind === 'test-output') setRuns((rs) => rs.map((r) => (r.id === m.runId ? { ...r, output: r.output + m.chunk } : r)))
    }
    sock.onclose = (e) => e.code === 4404 && setError('Ticket não encontrado')
    return () => sock.close()
  }, [ticketId])

  const strip = (s: string) => (ticket ? s.replaceAll(ticket.taskDir + '/', '') : s)

  const [params, setParams] = useSearchParams()
  const sdd = !!ticket && hasSdd(ticket, docs)
  const aba = params.get('aba')
  const tab = TABS.includes(aba ?? '') && (aba !== 'spec' || sdd) ? aba! : ticket?.stage === 'spec' || ticket?.stage === 'plan' ? 'spec' : 'log'

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <Topbar crumbs={[ws?.name ?? '…', 'Tickets', ticketId ?? '']} />
      {error && <p className="px-8 py-7 text-destructive">{error}</p>}
      {ticket && (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-col gap-3 px-8 pt-6">
              <div className="flex items-center gap-3">
                <span className="shrink-0 font-mono text-sm text-muted-foreground">{ticket.id}</span>
                <h1 className="min-w-0 truncate text-2xl font-medium tracking-[-0.025em]" title={ticket.title}>
                  {ticket.title}
                </h1>
                <TicketStatusBadge status={ticket.status} />
                {isActive(ticket) && <StopButton ticketId={ticket.id} />}
                {!isActive(ticket) && !isClosed(ticket) && <CloseTicketButton ticket={ticket} />}
              </div>
              <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted-foreground">
                <Badge variant="outline" className="h-6 max-w-full gap-1.5 font-mono font-normal" title={ticket.branch}>
                  <GitBranch />
                  <span className="truncate">{ticket.branch}</span>
                </Badge>
                <Badge variant="outline" className="h-6 font-normal">
                  {agentLabel(ticket)}
                </Badge>
                <span className="whitespace-nowrap">criado {new Date(ticket.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
              <StageStepper ticket={ticket} docs={docs} />
            </div>
            <Tabs
              value={tab}
              onValueChange={(v) => setParams((p) => (p.set('aba', v), p))}
              className="flex min-h-0 flex-1 flex-col gap-3 px-8 py-5"
            >
              <div className="flex items-center gap-2.5">
                <TabsList>
                  {sdd && (
                    <TabsTrigger value="spec" className="px-3">
                      <FileText />
                      Spec e plano
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="log" className="px-3">
                    <SquareTerminal />
                    Log
                  </TabsTrigger>
                  <TabsTrigger value="diff" className="px-3">
                    <FileDiff />
                    Diff
                  </TabsTrigger>
                  <TabsTrigger value="testes" className="px-3">
                    <FlaskConical />
                    Testes
                  </TabsTrigger>
                </TabsList>
                {ticket.status === 'running' && <Badge className="bg-info-soft text-info">ao vivo</Badge>}
                {!isClosed(ticket) && <span className="ml-auto min-w-0 truncate font-mono text-[12px] text-muted-foreground">{ticket.taskDir}</span>}
              </div>
              <TabsContent value="spec" className="flex min-h-0 flex-col">
                <DocsPanel ticket={ticket} docs={docs} onDocs={setDocs} />
              </TabsContent>
              <TabsContent value="log" className="flex min-h-0 flex-col">
                <LogPanel ticket={ticket} events={events} strip={strip} />
              </TabsContent>
              <TabsContent value="diff" className="flex min-h-0 flex-col">
                <DiffPanel ticket={ticket} />
              </TabsContent>
              <TabsContent value="testes" className="flex min-h-0 flex-col">
                <TestsPanel ticket={ticket} runs={runs} />
              </TabsContent>
            </Tabs>
          </div>
          <ChatPanel ticket={ticket} events={events} strip={strip} />
        </div>
      )}
    </div>
  )
}

function LogPanel({ ticket, events, strip }: { ticket: TicketT; events: TicketEvent[]; strip: (s: string) => string }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [events.length])

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-[14px] border border-line bg-surface px-4 py-3.5 font-mono text-[12.5px]">
      {events.map((e) => (
        <LogLine key={e.seq} at={e.at} event={e.event} strip={strip} />
      ))}
      {ticket.status === 'running' && <div className="animate-pulse pt-1.5">▍</div>}
      <div ref={end} />
    </div>
  )
}

const time = (at: string) => new Date(at).toLocaleTimeString('pt-BR')

function LogLine({ at, event, strip }: { at: string; event: AgentEvent; strip: (s: string) => string }) {
  const row = (label: string, body: React.ReactNode, className?: string) => (
    <div className="flex items-baseline gap-3 py-1">
      <span className="w-16 shrink-0 text-faint">{time(at)}</span>
      <span className="min-w-12 shrink-0 font-medium">{label}</span>
      <span className={cn('min-w-0 flex-1 break-words whitespace-pre-wrap text-body', className)}>{body}</span>
    </div>
  )
  if (event.type === 'tool') return row(event.name, strip(toolSummary(event)))
  if (event.type === 'tool_result' && event.error) return row('', strip(event.output.split('\n')[0]), 'text-red-600 dark:text-red-400')
  if (event.type === 'note')
    return row(
      'studio',
      event.url ? (
        <>
          {event.text}{' '}
          <a href={event.url} target="_blank" rel="noreferrer" className="underline">
            {event.url}
          </a>
        </>
      ) : (
        event.text
      ),
      'text-violet-700 dark:text-violet-400',
    )
  if (event.type === 'result') {
    const spent = event.costUsd !== undefined ? `US$ ${event.costUsd.toFixed(2)}` : event.tokens !== undefined ? `${event.tokens.toLocaleString('pt-BR')} tokens` : null
    const summary = [`${(event.durationMs / 1000).toFixed(0)} s`, `${event.turns} turnos`, spent].filter(Boolean).join(' · ')
    return event.ok
      ? row('', `✓ concluído · ${summary}`, 'text-green-600 dark:text-green-400')
      : row('', `✗ ${event.error ?? 'falhou'}`, 'text-red-600 dark:text-red-400')
  }
  return null
}

function toolSummary(e: Extract<AgentEvent, { type: 'tool' }>): string {
  const i = e.input
  const s = (k: string) => (typeof i[k] === 'string' ? (i[k] as string) : '')
  if (e.name === 'AskUserQuestion') return (i.questions as { question: string }[]).map((q) => q.question).join(' · ')
  return s('file_path') || s('command') || s('pattern') || s('url') || s('description') || JSON.stringify(i).slice(0, 160)
}

function StopButton({ ticketId }: { ticketId: string }) {
  const [busy, setBusy] = useState(false)
  const stop = () => {
    setBusy(true)
    api(`/tickets/${ticketId}/stop`, { method: 'POST' }).catch(() => {}).finally(() => setBusy(false))
  }
  return (
    <Button variant="outline" size="sm" className="ml-auto" disabled={busy} onClick={stop}>
      <Square className="fill-current" />
      {busy ? 'Parando…' : 'Parar'}
    </Button>
  )
}

const CHAT_WIDTH = 'studio.chat.width'
const CHAT_COLLAPSED = 'studio.chat.collapsed'

// Preferência só deste navegador; sem storage (aba anônima, bloqueio) fica o padrão.
function load(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

function ChatPanel({ ticket, events, strip }: { ticket: TicketT; events: TicketEvent[]; strip: (s: string) => string }) {
  const end = useRef<HTMLDivElement>(null)
  const messages = events.filter((e) => ['user', 'text', 'ask'].includes(e.event.type))
  const replies = new Map<string, Reply>()
  for (const { event } of events) if (event.type === 'answer') replies.set(event.id, event.reply)
  const [width, setWidth] = useState(() => Number(load(CHAT_WIDTH)) || 440)
  const [collapsed, setCollapsed] = useState(() => load(CHAT_COLLAPSED) === '1')
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, replies.size, collapsed])

  const collapse = (v: boolean) => {
    setCollapsed(v)
    save(CHAT_COLLAPSED, v ? '1' : '0')
  }

  const drag = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    let w = startW
    handle.onpointermove = (m) => {
      w = Math.min(Math.max(startW + startX - m.clientX, 320), window.innerWidth / 2)
      setWidth(w)
    }
    handle.onpointerup = () => {
      handle.onpointermove = null
      handle.onpointerup = null
      save(CHAT_WIDTH, String(Math.round(w)))
    }
  }

  if (collapsed)
    return (
      <aside className="flex shrink-0 flex-col items-center border-l border-sidebar-border px-2 py-5">
        <Button variant="ghost" size="icon" title="Abrir o chat" onClick={() => collapse(false)}>
          <PanelRightOpen />
        </Button>
      </aside>
    )

  return (
    <aside className="relative flex max-w-[50vw] shrink-0 flex-col gap-4 border-l border-sidebar-border px-5 py-5" style={{ width }}>
      <div onPointerDown={drag} className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-border/60" title="Arraste para redimensionar" />
      <div className="flex items-center gap-2.5">
        <span className="font-medium">Chat</span>
        <span className="text-[13px] text-muted-foreground">{agentLabel(ticket)}</span>
        <Button variant="ghost" size="icon" className="ml-auto size-7" title="Recolher o chat" onClick={() => collapse(true)}>
          <PanelRightClose />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
        {messages.map(({ seq, event }) =>
          event.type === 'user' ? (
            <div key={seq} className="max-w-[88%] self-end rounded-[16px_16px_4px_16px] bg-accent px-3.5 py-2.5">
              <Markdown text={event.text} />
            </div>
          ) : event.type === 'text' ? (
            <Markdown key={seq} text={strip(event.text)} className="text-body" />
          ) : event.type === 'ask' ? (
            <AskCard
              key={seq}
              ticketId={ticket.id}
              askId={event.id}
              ask={event.ask}
              reply={replies.get(event.id)}
              open={ticket.status === 'waiting' && !replies.has(event.id)}
            />
          ) : null,
        )}
        {ticket.status === 'approval' && (
          <p className="rounded-[12px] border border-warning-line bg-warning-soft/40 px-3.5 py-2.5 text-[13px]">
            {ticket.stage === 'spec' ? 'A spec está pronta' : 'O plano está pronto'}. Aprove na aba Spec e plano ou peça ajustes por aqui.
            {ticket.stage === 'spec' && ticket.pickRepos && ' Ao aprovar, ficam só os repositórios da seção "Repositórios" da spec.'}
          </p>
        )}
        {ticket.status === 'running' && (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
            trabalhando…
          </div>
        )}
        <div ref={end} />
      </div>
      {isClosed(ticket) ? (
        <p className="text-center text-[13px] text-muted-foreground">Ticket encerrado. A conversa fica só para consulta.</p>
      ) : (
        <Composer ticket={ticket} />
      )}
    </aside>
  )
}

function AskCard({ ticketId, askId, ask, reply, open }: { ticketId: string; askId: string; ask: Ask; reply?: Reply; open: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const send = (r: Reply) => {
    setBusy(true)
    setError(null)
    api(`/tickets/${ticketId}/asks/${askId}`, { method: 'POST', body: r })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Falha ao responder'))
      .finally(() => setBusy(false))
  }

  return (
    <div className={cn('flex flex-col gap-3 rounded-[14px] border px-4 py-3.5', open ? 'border-warning-line bg-warning-soft/40' : 'border-line')}>
      {ask.kind === 'permission' ? (
        <>
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <ShieldQuestion className="size-4 text-amber-600 dark:text-amber-400" />
            {ask.title}
          </div>
          <code className="rounded-lg bg-surface px-2.5 py-2 font-mono text-[12px] break-all whitespace-pre-wrap">{ask.detail}</code>
          {open ? (
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => send({ allow: true })}>
                Permitir
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => send({ allow: false })}>
                Recusar
              </Button>
            </div>
          ) : (
            <span className="text-[13px] text-muted-foreground">
              {reply ? (reply.allow ? '✓ Permitido' : '✗ Recusado') : 'Sem resposta'}
            </span>
          )}
        </>
      ) : (
        <Questions ask={ask} reply={reply} open={open} busy={busy} onSubmit={(answers) => send({ allow: true, answers })} />
      )}
      {error && <span className="text-[13px] text-destructive">{error}</span>}
    </div>
  )
}

function Questions({
  ask,
  reply,
  open,
  busy,
  onSubmit,
}: {
  ask: Extract<Ask, { kind: 'question' }>
  reply?: Reply
  open: boolean
  busy: boolean
  onSubmit: (answers: Record<string, string>) => void
}) {
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [other, setOther] = useState<Record<string, string>>({})
  const answerOf = (q: string) => other[q]?.trim() || (picked[q] ?? []).join(', ')
  const ready = ask.questions.every((q) => answerOf(q.question))

  const toggle = (q: string, label: string, multi: boolean) =>
    setPicked((p) => {
      const cur = p[q] ?? []
      if (!multi) return { ...p, [q]: [label] }
      return { ...p, [q]: cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label] }
    })

  return (
    <>
      {ask.questions.map((q) => (
        <div key={q.question} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-normal">
              {q.header}
            </Badge>
            {q.multiSelect && <span className="text-[12px] text-muted-foreground">várias opções</span>}
          </div>
          <span className="text-[13.5px] font-medium">{q.question}</span>
          {open ? (
            <>
              <div className="flex flex-col gap-1.5">
                {q.options.map((op) => {
                  const on = (picked[q.question] ?? []).includes(op.label)
                  return (
                    <button
                      key={op.label}
                      type="button"
                      onClick={() => toggle(q.question, op.label, q.multiSelect)}
                      className={cn(
                        'rounded-[10px] border px-3 py-2 text-left transition-colors',
                        on ? 'border-primary bg-accent' : 'border-border hover:bg-surface',
                      )}
                    >
                      <div className="text-[13px] font-medium">{op.label}</div>
                      <div className="text-[12px] text-muted-foreground">{op.description}</div>
                    </button>
                  )
                })}
              </div>
              <Input
                placeholder="Outra resposta"
                value={other[q.question] ?? ''}
                onChange={(e) => setOther((o) => ({ ...o, [q.question]: e.target.value }))}
              />
            </>
          ) : (
            <span className="text-[13px] text-muted-foreground">{reply?.answers?.[q.question] ?? 'Sem resposta'}</span>
          )}
        </div>
      ))}
      {open && (
        <Button
          size="sm"
          className="self-start"
          disabled={busy || !ready}
          onClick={() => onSubmit(Object.fromEntries(ask.questions.map((q) => [q.question, answerOf(q.question)])))}
        >
          Responder
        </Button>
      )}
    </>
  )
}

function Composer({ ticket }: { ticket: TicketT }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    api(`/tickets/${ticket.id}/messages`, { method: 'POST', body: { text } })
      .then(() => setText(''))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Falha ao enviar'))
      .finally(() => setBusy(false))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end gap-2 rounded-[14px] border border-border px-3 py-2 focus-within:border-ring">
        <Textarea
          id="composer"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={isActive(ticket) ? 'Entra quando o agente terminar o que está fazendo' : 'Continuar a conversa…'}
          className="max-h-40 min-h-9 resize-none border-0 bg-transparent dark:bg-transparent p-1 shadow-none focus-visible:ring-0"
          rows={1}
        />
        <Button size="icon-sm" className="rounded-full" disabled={!text.trim() || busy} onClick={send} aria-label="Enviar">
          <ArrowUp />
        </Button>
      </div>
      {error && <span className="text-[13px] text-destructive">{error}</span>}
    </div>
  )
}
