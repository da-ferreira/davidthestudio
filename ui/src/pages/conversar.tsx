import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowUp, Square, TicketPlus } from 'lucide-react'
import type { AgentEvent, AgentKind, Connections, Conversation, ConversationStatus, Improvement, TicketEvent, TicketProposal, Workspace, WorkspaceDetail, WsMessage } from '@studio/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Topbar } from '@/components/topbar'
import { Markdown } from '@/components/markdown'
import { agentLabel } from '@/components/ticket-status'
import { ModelSelect } from '@/components/model-select'
import { TicketForm } from '@/components/ticket-form'
import { AttachButton, AttachmentPreview, UserImages, useImageAttachments } from '@/components/image-attachments'
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { setActiveChat } from '@/lib/active-chat'
import { cn } from '@/lib/utils'

const STATUS: Record<ConversationStatus, { label: string; className: string } | null> = {
  running: { label: 'Respondendo', className: 'bg-info-soft text-info' },
  idle: null,
  error: { label: 'Erro', className: 'bg-danger-soft text-danger' },
  interrupted: { label: 'Parado', className: 'bg-muted text-subtle' },
}

const date = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function Conversar() {
  const { id, conversationId } = useParams()
  const navigate = useNavigate()
  const [ws, setWs] = useState<Workspace | null>(null)
  const [list, setList] = useState<Conversation[]>([])

  // A conversa aberta aqui é a que o balão continua nas outras telas.
  useEffect(() => {
    if (id && conversationId) setActiveChat({ workspaceId: id, conversationId })
  }, [id, conversationId])

  useEffect(() => {
    api<Workspace[]>('/workspaces').then((all) => setWs(all.find((w) => w.id === id) ?? null))
    api<Conversation[]>(`/workspaces/${id}/conversations`).then(setList)
  }, [id])

  const upsert = (c: Conversation) => setList((l) => (l.some((x) => x.id === c.id) ? l.map((x) => (x.id === c.id ? c : x)) : [c, ...l]))
  const remove = (cid: string) => setList((l) => l.filter((x) => x.id !== cid))

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <Topbar
        crumbs={[ws?.name ?? '…', 'Conversar']}
        actions={
          conversationId && (
            <Button asChild variant="outline">
              <Link to={`/w/${id}/conversar`}>Nova conversa</Link>
            </Button>
          )
        }
      />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[300px] shrink-0 flex-col gap-1 overflow-auto border-r border-sidebar-border px-3 py-4">
          {!list.length && <p className="px-2 text-[13px] text-muted-foreground">Nenhuma conversa ainda.</p>}
          {list.map((c) => (
            <Link
              key={c.id}
              to={`/w/${id}/conversar/${c.id}`}
              className={cn('flex flex-col gap-0.5 rounded-[10px] px-3 py-2 hover:bg-surface-2', c.id === conversationId && 'bg-accent hover:bg-accent')}
            >
              <span className="truncate text-[14px]">{c.title}</span>
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                {c.status === 'running' && <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />}
                {c.author ?? '—'} · {date(c.createdAt)}
              </span>
            </Link>
          ))}
        </aside>
        {conversationId ? (
          <Chat
            key={conversationId}
            conversationId={conversationId}
            workspaceId={id!}
            onUpdate={upsert}
            onDelete={(cid) => {
              remove(cid)
              setActiveChat({ workspaceId: id!, conversationId: null })
              navigate(`/w/${id}/conversar`)
            }}
          />
        ) : (
          <NewConversation
            workspaceId={id!}
            workspaceName={ws?.name}
            onCreate={(c) => {
              upsert(c)
              navigate(`/w/${id}/conversar/${c.id}`)
            }}
          />
        )}
      </div>
    </div>
  )
}

export function NewConversation({
  workspaceId,
  workspaceName,
  onCreate,
  compact,
}: {
  workspaceId: string
  workspaceName?: string
  onCreate: (c: Conversation) => void
  compact?: boolean
}) {
  const [text, setText] = useState('')
  const [agent, setAgent] = useState<AgentKind>('claude')
  const [model, setModel] = useState('sonnet')
  const [codexModel, setCodexModel] = useState('')
  const [conn, setConn] = useState<Connections | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const attachments = useImageAttachments()
  const empty = !text.trim() && !attachments.ids.length

  useEffect(() => {
    api<Connections>('/me/connections').then(setConn)
  }, [])

  const disconnected = !!conn && !conn[agent].connected
  const submit = async () => {
    if (empty || busy || disconnected || attachments.uploading) return
    setBusy(true)
    setError(null)
    try {
      const c = await api<Conversation>(`/workspaces/${workspaceId}/conversations`, {
        method: 'POST',
        body: { text, images: attachments.ids, agent, model: agent === 'codex' ? codexModel : model },
      })
      onCreate(c)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Falhou')
      setBusy(false)
    }
  }

  return (
    <div className={cn('flex min-w-0 flex-1 flex-col items-center overflow-auto', compact ? 'gap-4 px-4 py-6' : 'gap-6 px-10 py-10')}>
      <div className="flex flex-col items-center gap-1.5 text-center">
        <h1 className={cn('font-medium', compact ? 'text-[18px] tracking-[-0.02em]' : 'text-[28px] tracking-[-0.025em]')}>Sobre o que vamos conversar em {workspaceName ?? '…'}?</h1>
        <span className={cn('text-muted-foreground', compact && 'text-[13px]')}>O agente lê os repositórios na branch padrão e o contexto do workspace. Não mexe no código: só anota melhorias e propõe tickets.</span>
      </div>
      <div
        {...attachments.dropProps}
        className={cn(
          'flex w-full max-w-[720px] flex-col gap-3 rounded-[22px] border bg-card p-4 pb-3 shadow-[0_4px_16px_rgba(0,0,0,.06)]',
          attachments.dragging && 'border-ring',
        )}
      >
        <Textarea
          autoFocus
          placeholder="Ex.: como funciona a autenticação entre o app e a API?"
          className="min-h-[96px] resize-none border-0 bg-transparent dark:bg-transparent p-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={attachments.onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <AttachmentPreview attachments={attachments} />
        <div className="flex items-center gap-2">
          <AttachButton attachments={attachments} />
          <Select value={agent} onValueChange={(v) => setAgent(v as AgentKind)}>
            <SelectTrigger size="sm" className="w-[140px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude">Claude Code</SelectItem>
              <SelectItem value="codex">Codex</SelectItem>
            </SelectContent>
          </Select>
          {agent === 'codex' ? (
            <ModelSelect key="codex" agent="codex" value={codexModel} onChange={setCodexModel} small className={compact ? 'min-w-0 flex-1' : 'w-[240px]'} />
          ) : (
            <ModelSelect key="claude" agent="claude" value={model} onChange={setModel} small className={compact ? 'min-w-0 flex-1' : 'w-[180px]'} />
          )}
          <Button size="icon-sm" className="ml-auto rounded-full" disabled={empty || busy || disconnected || attachments.uploading} onClick={submit} aria-label="Enviar">
            <ArrowUp />
          </Button>
        </div>
      </div>
      {disconnected && (
        <span className="text-[13px] text-destructive">
          O {agent === 'codex' ? 'Codex' : 'Claude Code'} não está conectado.{' '}
          <Link to="/conexoes" className="underline">
            Conectar
          </Link>
        </span>
      )}
      {error && <span className="text-[13px] text-destructive">{error}</span>}
    </div>
  )
}

export function Chat({
  conversationId,
  workspaceId,
  onUpdate,
  onDelete,
  compact,
}: {
  conversationId: string
  workspaceId: string
  onUpdate: (c: Conversation) => void
  onDelete: (id: string) => void
  compact?: boolean
}) {
  const { user } = useAuth()
  const [c, setC] = useState<Conversation | null>(null)
  const [events, setEvents] = useState<TicketEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [ws, setWs] = useState<WorkspaceDetail | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api<WorkspaceDetail>(`/workspaces/${workspaceId}`).then(setWs)
  }, [workspaceId])

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const sock = new WebSocket(`${proto}://${location.host}/ws/conversations/${conversationId}`)
    sock.onmessage = (msg) => {
      const m = JSON.parse(msg.data) as WsMessage
      if (m.kind === 'conversation') {
        setC(m.conversation)
        onUpdate(m.conversation)
      } else if (m.kind === 'event') setEvents((es) => [...es, m.event])
    }
    sock.onclose = (e) => e.code === 4404 && setError('Conversa não encontrada')
    return () => sock.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  const loaded = !!c
  useEffect(() => {
    // Rola só a lista: scrollIntoView também rolaria a página por trás do balão.
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [events.length, loaded])

  if (error) return <p className="px-8 py-7 text-destructive">{error}</p>
  if (!c) return <div className="flex-1" />

  const status = STATUS[c.status]
  // Proposta resolvida: id -> ticket criado (null quando descartada).
  const done = new Map(events.flatMap(({ event: e }) => (e.type === 'proposal_done' ? [[e.id, e.ticketId ?? null] as const] : [])))
  const canDelete = c.authorId === user.id || user.admin
  const del = () =>
    api(`/conversations/${c.id}`, { method: 'DELETE' }).then(() => onDelete(c.id))

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className={cn('flex items-center border-b border-line', compact ? 'gap-2 px-4 py-2.5' : 'gap-3 px-8 py-4')}>
        <h1 className={cn('min-w-0 truncate font-medium', compact ? 'text-[14px]' : 'text-[18px] tracking-[-0.02em]')}>{c.title}</h1>
        {status && <Badge className={status.className}>{status.label}</Badge>}
        {!compact && (
          <span className="shrink-0 text-[13px] text-muted-foreground">
            {c.author} · {agentLabel(c)}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {c.status === 'running' && (
            <Button size="sm" variant="outline" onClick={() => api(`/conversations/${c.id}/stop`, { method: 'POST' }).catch(() => {})}>
              <Square className="fill-current" />
              Parar
            </Button>
          )}
          {canDelete && c.status !== 'running' && (
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setDeleting(true)}>
              Apagar
            </Button>
          )}
        </div>
      </div>
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className={cn('mx-auto flex w-full max-w-[760px] flex-col gap-4', compact ? 'px-4 py-4' : 'px-8 py-6')}>
          {events.map(({ seq, event }) => (
            event.type === 'proposal' ? (
              <ProposalCard
                key={seq}
                conversation={c}
                workspace={ws}
                proposalId={event.id}
                proposal={event.proposal}
                done={done.has(event.id) ? { ticketId: done.get(event.id)! } : null}
                mine={c.authorId === user.id}
              />
            ) : (
              <Message
                key={seq}
                event={event}
                strip={(s) => s.replace(new RegExp(`\\S*/conversations/${c.id}/`, 'g'), '')}
                workspaceId={workspaceId}
                conversationId={c.id}
                mine={c.authorId === user.id}
                running={c.status === 'running'}
              />
            )
          ))}
          {c.status === 'running' && (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
              lendo o código…
            </div>
          )}
        </div>
      </div>
      <div className={cn('mx-auto w-full max-w-[760px]', compact ? 'px-3 pb-3' : 'px-8 pb-6')}>
        {c.authorId === user.id ? (
          <Composer conversationId={c.id} running={c.status === 'running'} />
        ) : (
          <p className="text-center text-[13px] text-muted-foreground">Só {c.author ?? 'quem abriu a conversa'} pode continuar, porque ela roda no agente dessa pessoa.</p>
        )}
      </div>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar esta conversa?</AlertDialogTitle>
            <AlertDialogDescription>A conversa some para todos do workspace. Não dá para desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={del}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Message({
  event,
  strip,
  workspaceId,
  conversationId,
  mine,
  running,
}: {
  event: AgentEvent
  strip: (s: string) => string
  workspaceId: string
  conversationId: string
  mine: boolean
  running: boolean
}) {
  if (event.type === 'user')
    return (
      <div className="flex max-w-[80%] flex-col gap-2 self-end rounded-[16px_16px_4px_16px] bg-accent px-3.5 py-2.5">
        <UserImages ids={event.images} />
        {event.text && <Markdown text={event.text} />}
      </div>
    )
  if (event.type === 'text') return <Markdown text={event.text} className="text-body" />
  if (event.type === 'tool') {
    const studio = studioTool(event.name)
    if (studio === 'propor_ticket') return null
    if (studio === 'listar_melhorias') return <ImprovementsCard workspaceId={workspaceId} conversationId={conversationId} mine={mine} running={running} />
    if (studio) return <span className="truncate text-[12px] text-faint">{studioLabel(studio, event.input)}</span>
    const i = event.input
    const s = (k: string) => (typeof i[k] === 'string' ? (i[k] as string) : '')
    const detail = s('file_path') || s('pattern') || s('command') || s('query') || s('url')
    return (
      <span className="truncate font-mono text-[12px] text-faint">
        {event.name} {strip(detail)}
      </span>
    )
  }
  if (event.type === 'result' && !event.ok) return <span className="text-[13px] text-destructive">✗ {event.error ?? 'falhou'}</span>
  return null
}

// Ferramentas do servidor MCP do studio: mcp__studio__x no Claude, studio.x no Codex.
function studioTool(name: string) {
  return name.match(/^(?:mcp__studio__|studio\.)(\w+)$/)?.[1] ?? null
}

function studioLabel(tool: string, input: Record<string, unknown>) {
  const title = typeof input.titulo === 'string' ? `: ${input.titulo}` : ''
  if (tool === 'criar_melhoria') return `criou melhoria${title}`
  if (tool === 'editar_melhoria') return `editou melhoria${title}${typeof input.status === 'string' ? ` (${input.status})` : ''}`
  if (tool === 'apagar_melhoria') return 'apagou uma melhoria'
  return tool
}

const IMPROVEMENT_STATUS: Record<'open' | 'ticket', { label: string; className: string }> = {
  open: { label: 'Aberta', className: 'bg-info-soft text-info' },
  ticket: { label: 'Em ticket', className: 'bg-warning-soft text-warning' },
}

function ImprovementsCard({
  workspaceId,
  conversationId,
  mine,
  running,
}: {
  workspaceId: string
  conversationId: string
  mine: boolean
  running: boolean
}) {
  const [items, setItems] = useState<Improvement[] | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Improvement[]>(`/workspaces/${workspaceId}/improvements`).then(setItems)
  }, [workspaceId])

  const ask = (i: Improvement) => {
    setSendingId(i.id)
    setError(null)
    api(`/conversations/${conversationId}/messages`, { method: 'POST', body: { text: `Abre um ticket a partir da melhoria ${i.id}: ${i.title}` } })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Falha ao enviar'))
      .finally(() => setSendingId(null))
  }

  if (!items) return <span className="text-[13px] text-faint">lendo a lista de melhorias…</span>

  const shown = items.filter((i): i is Improvement & { status: 'open' | 'ticket' } => i.status !== 'done')

  return (
    <div className="flex flex-col gap-2.5 rounded-[16px] border bg-surface-2 p-4">
      <span className="text-[13px] font-medium text-muted-foreground">Melhorias do workspace</span>
      {shown.length === 0 && <span className="text-[13px] text-muted-foreground">Nenhuma melhoria aberta ou em ticket.</span>}
      {shown.map((i) => (
        <div key={i.id} className="flex items-center gap-2 text-[14px]">
          <span className="min-w-0 flex-1 truncate">{i.title}</span>
          <Badge className={IMPROVEMENT_STATUS[i.status].className}>{IMPROVEMENT_STATUS[i.status].label}</Badge>
          {i.status === 'ticket' && i.ticketId && (
            <Link to={`/w/${workspaceId}/tickets/${i.ticketId}`} className="shrink-0 text-[13px] text-muted-foreground underline">
              {i.ticketId}
            </Link>
          )}
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            disabled={i.status === 'ticket' || !mine || running || sendingId === i.id}
            onClick={() => ask(i)}
          >
            Abrir ticket
          </Button>
        </div>
      ))}
      {error && <span className="text-[13px] text-destructive">{error}</span>}
    </div>
  )
}

function ProposalCard({
  conversation,
  workspace,
  proposalId,
  proposal,
  done,
  mine,
}: {
  conversation: Conversation
  workspace: WorkspaceDetail | null
  proposalId: string
  proposal: TicketProposal
  done: { ticketId: string | null } | null
  mine: boolean
}) {
  const [discarding, setDiscarding] = useState(false)
  const resolve = (ticket?: object) =>
    api<{ ticketId: string | null }>(`/conversations/${conversation.id}/proposals/${proposalId}`, { method: 'POST', body: { ticket } })

  return (
    <div className="flex flex-col gap-3 rounded-[16px] border bg-surface-2 p-4">
      <div className="flex items-center gap-2 text-[14px] font-medium">
        <TicketPlus className="size-4" />
        Ticket proposto
        {done && (
          <span className="ml-auto text-[13px] font-normal text-muted-foreground">
            {done.ticketId ? (
              <Link to={`/w/${conversation.workspaceId}/tickets/${done.ticketId}`} className="underline">
                Ticket {done.ticketId} criado
              </Link>
            ) : (
              'Descartado'
            )}
          </span>
        )}
      </div>
      {done ? (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{proposal.title}</span>
          {proposal.description && <Markdown text={proposal.description} className="text-[14px] text-muted-foreground" />}
        </div>
      ) : (
        <>
          <TicketForm
            workspace={workspace}
            layout="card"
            readOnly={!mine}
            initial={{ title: proposal.title, description: proposal.description, repos: proposal.repos, agent: conversation.agent, model: conversation.model, sdd: true, gates: ['spec', 'plan'] }}
            submitLabel="Criar ticket"
            busyLabel="Criando worktrees…"
            cancelLabel={discarding ? 'Descartando…' : 'Descartar'}
            onSubmit={async (ticket) => {
              await resolve(ticket)
            }}
            onCancel={() => {
              setDiscarding(true)
              resolve().finally(() => setDiscarding(false))
            }}
          />
          {!mine && <span className="text-[13px] text-muted-foreground">Só {conversation.author ?? 'quem abriu a conversa'} pode criar este ticket.</span>}
        </>
      )}
    </div>
  )
}

function Composer({ conversationId, running }: { conversationId: string; running: boolean }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const attachments = useImageAttachments()
  const empty = !text.trim() && !attachments.ids.length

  const send = () => {
    if (empty || busy || attachments.uploading) return
    setBusy(true)
    setError(null)
    api(`/conversations/${conversationId}/messages`, { method: 'POST', body: { text, images: attachments.ids } })
      .then(() => {
        setText('')
        attachments.clear()
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Falha ao enviar'))
      .finally(() => setBusy(false))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <AttachmentPreview attachments={attachments} />
      <div
        {...attachments.dropProps}
        className={cn('flex items-end gap-2 rounded-[14px] border border-border px-3 py-2 focus-within:border-ring', attachments.dragging && 'border-ring bg-accent/50')}
      >
        <AttachButton attachments={attachments} />
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={attachments.onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={running ? 'Entra quando o agente terminar a resposta' : 'Continuar a conversa…'}
          className="max-h-40 min-h-9 resize-none border-0 bg-transparent dark:bg-transparent p-1 shadow-none focus-visible:ring-0"
          rows={1}
        />
        <Button size="icon-sm" className="rounded-full" disabled={empty || busy || attachments.uploading} onClick={send} aria-label="Enviar">
          <ArrowUp />
        </Button>
      </div>
      {error && <span className="text-[13px] text-destructive">{error}</span>}
    </div>
  )
}
