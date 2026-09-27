import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowUp, Square } from 'lucide-react'
import type { AgentEvent, AgentKind, Connections, Conversation, ConversationStatus, TicketEvent, Workspace, WsMessage } from '@studio/shared'
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
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

const STATUS: Record<ConversationStatus, { label: string; className: string } | null> = {
  running: { label: 'Respondendo', className: 'bg-info-soft text-info' },
  idle: null,
  error: { label: 'Erro', className: 'bg-danger-soft text-danger' },
  interrupted: { label: 'Parado', className: 'bg-muted text-subtle' },
}

const date = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function Perguntar() {
  const { id, conversationId } = useParams()
  const [ws, setWs] = useState<Workspace | null>(null)
  const [list, setList] = useState<Conversation[]>([])

  useEffect(() => {
    api<Workspace[]>('/workspaces').then((all) => setWs(all.find((w) => w.id === id) ?? null))
    api<Conversation[]>(`/workspaces/${id}/conversations`).then(setList)
  }, [id])

  const upsert = (c: Conversation) => setList((l) => (l.some((x) => x.id === c.id) ? l.map((x) => (x.id === c.id ? c : x)) : [c, ...l]))
  const remove = (cid: string) => setList((l) => l.filter((x) => x.id !== cid))

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <Topbar
        crumbs={[ws?.name ?? '…', 'Perguntar']}
        actions={
          conversationId && (
            <Button asChild variant="outline">
              <Link to={`/w/${id}/perguntar`}>Nova pergunta</Link>
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
              to={`/w/${id}/perguntar/${c.id}`}
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
          <Chat key={conversationId} conversationId={conversationId} workspaceId={id!} onUpdate={upsert} onDelete={remove} />
        ) : (
          <NewQuestion workspaceId={id!} workspaceName={ws?.name} onCreate={upsert} />
        )}
      </div>
    </div>
  )
}

function NewQuestion({ workspaceId, workspaceName, onCreate }: { workspaceId: string; workspaceName?: string; onCreate: (c: Conversation) => void }) {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [agent, setAgent] = useState<AgentKind>('claude')
  const [model, setModel] = useState('sonnet')
  const [codexModel, setCodexModel] = useState('')
  const [conn, setConn] = useState<Connections | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Connections>('/me/connections').then(setConn)
  }, [])

  const disconnected = !!conn && !conn[agent].connected
  const submit = async () => {
    if (!text.trim() || busy || disconnected) return
    setBusy(true)
    setError(null)
    try {
      const c = await api<Conversation>(`/workspaces/${workspaceId}/conversations`, {
        method: 'POST',
        body: { text, agent, model: agent === 'codex' ? codexModel : model },
      })
      onCreate(c)
      navigate(`/w/${workspaceId}/perguntar/${c.id}`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Falhou')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-6 overflow-auto px-10 py-10">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-[28px] font-medium tracking-[-0.025em]">O que você quer saber sobre {workspaceName ?? '…'}?</h1>
        <span className="text-muted-foreground">O agente lê os repositórios na branch padrão e o contexto do workspace. Não muda nada.</span>
      </div>
      <div className="flex w-full max-w-[720px] flex-col gap-3 rounded-[22px] border bg-card p-4 pb-3 shadow-[0_4px_16px_rgba(0,0,0,.06)]">
        <Textarea
          autoFocus
          placeholder="Ex.: como funciona a autenticação entre o app e a API?"
          className="min-h-[96px] resize-none border-0 bg-transparent dark:bg-transparent p-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <div className="flex items-center gap-2">
          <Select value={agent} onValueChange={(v) => setAgent(v as AgentKind)}>
            <SelectTrigger size="sm" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude">Claude Code</SelectItem>
              <SelectItem value="codex">Codex</SelectItem>
            </SelectContent>
          </Select>
          {agent === 'codex' ? (
            <ModelSelect key="codex" agent="codex" value={codexModel} onChange={setCodexModel} small className="w-[240px]" />
          ) : (
            <ModelSelect key="claude" agent="claude" value={model} onChange={setModel} small className="w-[180px]" />
          )}
          <Button size="icon-sm" className="ml-auto rounded-full" disabled={!text.trim() || busy || disconnected} onClick={submit} aria-label="Perguntar">
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

function Chat({
  conversationId,
  workspaceId,
  onUpdate,
  onDelete,
}: {
  conversationId: string
  workspaceId: string
  onUpdate: (c: Conversation) => void
  onDelete: (id: string) => void
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [c, setC] = useState<Conversation | null>(null)
  const [events, setEvents] = useState<TicketEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const end = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [events.length])

  if (error) return <p className="px-8 py-7 text-destructive">{error}</p>
  if (!c) return <div className="flex-1" />

  const status = STATUS[c.status]
  const canDelete = c.authorId === user.id || user.admin
  const del = () =>
    api(`/conversations/${c.id}`, { method: 'DELETE' }).then(() => {
      onDelete(c.id)
      navigate(`/w/${workspaceId}/perguntar`)
    })

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-line px-8 py-4">
        <h1 className="min-w-0 truncate text-[18px] font-medium tracking-[-0.02em]">{c.title}</h1>
        {status && <Badge className={status.className}>{status.label}</Badge>}
        <span className="shrink-0 text-[13px] text-muted-foreground">
          {c.author} · {agentLabel(c)}
        </span>
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
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-8 py-6">
          {events.map(({ seq, event }) => (
            <Message key={seq} event={event} strip={(s) => s.replace(new RegExp(`\\S*/conversations/${c.id}/`, 'g'), '')} />
          ))}
          {c.status === 'running' && (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
              lendo o código…
            </div>
          )}
          <div ref={end} />
        </div>
      </div>
      <div className="mx-auto w-full max-w-[760px] px-8 pb-6">
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

function Message({ event, strip }: { event: AgentEvent; strip: (s: string) => string }) {
  if (event.type === 'user')
    return (
      <div className="max-w-[80%] self-end rounded-[16px_16px_4px_16px] bg-accent px-3.5 py-2.5">
        <Markdown text={event.text} />
      </div>
    )
  if (event.type === 'text') return <Markdown text={event.text} className="text-body" />
  if (event.type === 'tool') {
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

function Composer({ conversationId, running }: { conversationId: string; running: boolean }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    api(`/conversations/${conversationId}/messages`, { method: 'POST', body: { text } })
      .then(() => setText(''))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Falha ao enviar'))
      .finally(() => setBusy(false))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end gap-2 rounded-[14px] border border-border px-3 py-2 focus-within:border-ring">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
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
        <Button size="icon-sm" className="rounded-full" disabled={!text.trim() || busy} onClick={send} aria-label="Enviar">
          <ArrowUp />
        </Button>
      </div>
      {error && <span className="text-[13px] text-destructive">{error}</span>}
    </div>
  )
}
