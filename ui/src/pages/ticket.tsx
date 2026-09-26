import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { GitBranch, SquareTerminal } from 'lucide-react'
import type { AgentEvent, Ticket as TicketT, TicketEvent, Workspace, WsMessage } from '@studio/shared'
import { Badge } from '@/components/ui/badge'
import { Topbar } from '@/components/topbar'
import { TicketStatusBadge, modelLabel } from '@/components/ticket-status'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export function Ticket() {
  const { id, ticketId } = useParams()
  const [ws, setWs] = useState<Workspace | null>(null)
  const [ticket, setTicket] = useState<TicketT | null>(null)
  const [events, setEvents] = useState<TicketEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Workspace[]>('/workspaces').then((all) => setWs(all.find((w) => w.id === id) ?? null))
  }, [id])

  useEffect(() => {
    setEvents([])
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const sock = new WebSocket(`${proto}://${location.host}/ws/tickets/${ticketId}`)
    sock.onmessage = (msg) => {
      const m = JSON.parse(msg.data) as WsMessage
      if (m.kind === 'ticket') setTicket(m.ticket)
      else setEvents((es) => [...es, m.event])
    }
    sock.onclose = (e) => e.code === 4404 && setError('Ticket não encontrado')
    return () => sock.close()
  }, [ticketId])

  const strip = (s: string) => (ticket ? s.replaceAll(ticket.taskDir + '/', '') : s)

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <Topbar crumbs={[ws?.name ?? '…', 'Tickets', ticketId ?? '']} />
      {error && <p className="px-8 py-7 text-destructive">{error}</p>}
      {ticket && (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-col gap-3 px-8 pt-6">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-muted-foreground">{ticket.id}</span>
                <h1 className="text-2xl font-medium tracking-[-0.025em]">{ticket.title}</h1>
                <TicketStatusBadge status={ticket.status} />
              </div>
              <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
                <Badge variant="outline" className="h-6 gap-1.5 font-mono font-normal">
                  <GitBranch />
                  {ticket.branch}
                </Badge>
                <Badge variant="outline" className="h-6 font-normal">
                  Claude Code · {modelLabel(ticket.model)}
                </Badge>
                <span>criado {new Date(ticket.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
            </div>
            <LogPanel ticket={ticket} events={events} strip={strip} />
          </div>
          <ChatPanel ticket={ticket} events={events} />
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
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-8 py-5">
      <div className="flex items-center gap-2.5">
        <SquareTerminal className="size-4" />
        <span className="font-medium">Log</span>
        {ticket.status === 'running' && <Badge className="bg-blue-50 text-blue-700">ao vivo</Badge>}
        <span className="ml-auto truncate font-mono text-[12px] text-muted-foreground">{ticket.taskDir}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-[14px] border border-[#efefef] bg-[#fafafa] px-4 py-3.5 font-mono text-[12.5px]">
        {events.map((e) => (
          <LogLine key={e.seq} at={e.at} event={e.event} strip={strip} />
        ))}
        {ticket.status === 'running' && <div className="animate-pulse pt-1.5">▍</div>}
        <div ref={end} />
      </div>
    </div>
  )
}

const time = (at: string) => new Date(at).toLocaleTimeString('pt-BR')

function LogLine({ at, event, strip }: { at: string; event: AgentEvent; strip: (s: string) => string }) {
  const row = (label: string, body: React.ReactNode, className?: string) => (
    <div className="flex items-baseline gap-3 py-1">
      <span className="w-16 shrink-0 text-neutral-400">{time(at)}</span>
      <span className="w-12 shrink-0 font-medium">{label}</span>
      <span className={cn('min-w-0 flex-1 break-words whitespace-pre-wrap text-neutral-800', className)}>{body}</span>
    </div>
  )
  if (event.type === 'tool') return row(event.name, strip(toolSummary(event)))
  if (event.type === 'tool_result' && event.error) return row('', strip(event.output.split('\n')[0]), 'text-red-600')
  if (event.type === 'result') {
    const summary = `${(event.durationMs / 1000).toFixed(0)} s · ${event.turns} turnos · US$ ${event.costUsd.toFixed(2)}`
    return event.ok
      ? row('', `✓ concluído · ${summary}`, 'text-green-600')
      : row('', `✗ ${event.error ?? 'falhou'}`, 'text-red-600')
  }
  return null
}

function toolSummary(e: Extract<AgentEvent, { type: 'tool' }>): string {
  const i = e.input
  const s = (k: string) => (typeof i[k] === 'string' ? (i[k] as string) : '')
  return s('file_path') || s('command') || s('pattern') || s('url') || s('description') || JSON.stringify(i).slice(0, 160)
}

function ChatPanel({ ticket, events }: { ticket: TicketT; events: TicketEvent[] }) {
  const end = useRef<HTMLDivElement>(null)
  const messages = events.filter((e) => e.event.type === 'user' || e.event.type === 'text')
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  return (
    <aside className="flex w-[440px] shrink-0 flex-col gap-4 border-l border-sidebar-border px-5 py-5">
      <div className="flex items-center gap-2.5">
        <span className="font-medium">Chat</span>
        <span className="text-[13px] text-muted-foreground">Claude Code · {modelLabel(ticket.model)}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
        {messages.map(({ seq, event }) =>
          event.type === 'user' ? (
            <div key={seq} className="max-w-[88%] self-end rounded-[16px_16px_4px_16px] bg-[#f2f2f2] px-3.5 py-2.5 leading-relaxed whitespace-pre-wrap">
              {event.text}
            </div>
          ) : event.type === 'text' ? (
            <div key={seq} className="leading-relaxed whitespace-pre-wrap text-neutral-800">
              {event.text}
            </div>
          ) : null,
        )}
        {ticket.status === 'running' && (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
            trabalhando…
          </div>
        )}
        <div ref={end} />
      </div>
    </aside>
  )
}
