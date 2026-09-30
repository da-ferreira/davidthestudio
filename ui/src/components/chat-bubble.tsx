import { useEffect, useRef, useState } from 'react'
import { Link, useMatch } from 'react-router'
import { ChevronDown, Maximize2, MessagesSquare, Minus, Plus } from 'lucide-react'
import type { Conversation, Workspace } from '@studio/shared'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Chat, NewConversation } from '@/pages/conversar'
import { setActiveChat, useActiveChat } from '@/lib/active-chat'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const BUTTON = 48
const MARGIN = 8
const GAP = 12
const POS_KEY = 'studio-chat-bubble-pos'

// Distância do botão às bordas direita e inferior: assim ele fica no canto ao redimensionar a janela.
type Pos = { right: number; bottom: number }

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max))

function readPos(): Pos {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null')
    if (typeof p?.right === 'number' && typeof p?.bottom === 'number') return p
  } catch {}
  return { right: 20, bottom: 20 }
}

function useViewport() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

// Balão presente em todas as telas: continua a última conversa aberta sem sair de onde se está.
export function ChatBubble() {
  const routeWs = useMatch('/w/:id/*')?.params.id
  const onConversar = !!useMatch('/w/:id/conversar/*')
  const active = useActiveChat()
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [list, setList] = useState<Conversation[] | null>(null)
  const [workspaceName, setWorkspaceName] = useState<string>()
  const [pos, setPos] = useState(readPos)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; y: number; start: Pos; last: Pos; moved: boolean } | null>(null)
  const { w: vw, h: vh } = useViewport()

  const workspaceId = active?.workspaceId ?? routeWs

  useEffect(() => {
    if (!workspaceId) return
    api<Workspace[]>('/workspaces').then((all) => setWorkspaceName(all.find((w) => w.id === workspaceId)?.name))
  }, [workspaceId])
  // Na tela Conversar a conversa já está na página inteira.
  if (!workspaceId || onConversar) return null
  const conversationId = active?.workspaceId === workspaceId ? active.conversationId : null
  const expand = `/w/${workspaceId}/conversar${conversationId ? `/${conversationId}` : ''}`

  const right = clamp(pos.right, MARGIN, vw - BUTTON - MARGIN)
  const bottom = clamp(pos.bottom, MARGIN, vh - BUTTON - MARGIN)
  const btnLeft = vw - right - BUTTON
  const btnTop = vh - bottom - BUTTON
  // O painel abre alinhado ao botão, em cima se couber; senão no lado com mais espaço, encolhendo a altura.
  const panelW = Math.min(420, vw - 2 * MARGIN)
  const spaceUp = btnTop - GAP - MARGIN
  const spaceDown = vh - btnTop - BUTTON - GAP - MARGIN
  const opensUp = spaceUp >= 640 || spaceUp >= spaceDown
  const panelH = Math.min(640, opensUp ? spaceUp : spaceDown)
  const panelLeft = clamp(btnLeft + BUTTON - panelW, MARGIN, vw - panelW - MARGIN)
  const panelTop = opensUp ? btnTop - GAP - panelH : btnTop + BUTTON + GAP

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, start: { right, bottom }, last: { right, bottom }, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    // Poucos pixels ainda contam como clique.
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    if (!d.moved) setDragging(true)
    d.moved = true
    d.last = { right: clamp(d.start.right - dx, MARGIN, vw - BUTTON - MARGIN), bottom: clamp(d.start.bottom - dy, MARGIN, vh - BUTTON - MARGIN) }
    setPos(d.last)
  }
  const onPointerUp = () => {
    if (drag.current?.moved) {
      setDragging(false)
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(drag.current.last))
      } catch {}
    }
  }

  return (
    <>
      <div
        className={cn(
          'fixed z-40 flex flex-col overflow-hidden rounded-2xl border bg-background shadow-[0_12px_40px_rgba(0,0,0,.14)] transition-[opacity,translate] duration-150',
          open ? 'translate-y-0 opacity-100' : cn('pointer-events-none invisible opacity-0', opensUp ? 'translate-y-2' : '-translate-y-2'),
        )}
        style={{ left: panelLeft, top: panelTop, width: panelW, height: panelH }}
      >
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-sidebar-border bg-sidebar px-2">
          <DropdownMenu onOpenChange={(o) => o && api<Conversation[]>(`/workspaces/${workspaceId}/conversations`).then(setList)}>
            <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium outline-none hover:bg-sidebar-accent">
              <MessagesSquare className="size-4" />
              Conversas
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 w-72">
              <DropdownMenuItem onSelect={() => setActiveChat({ workspaceId: routeWs ?? workspaceId, conversationId: null })}>
                <Plus />
                Nova conversa
              </DropdownMenuItem>
              {!!list?.length && <DropdownMenuSeparator />}
              {list?.map((c) => (
                <DropdownMenuItem key={c.id} onSelect={() => setActiveChat({ workspaceId, conversationId: c.id })} className={cn(c.id === conversationId && 'bg-accent')}>
                  {c.status === 'running' && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-blue-500" />}
                  <span className="truncate">{c.title}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ml-auto flex items-center">
            <Button asChild size="icon-sm" variant="ghost" className="text-muted-foreground" title="Abrir em tela cheia">
              <Link to={expand} onClick={() => setOpen(false)}>
                <Maximize2 />
              </Link>
            </Button>
            <Button size="icon-sm" variant="ghost" className="text-muted-foreground" title="Minimizar" onClick={() => setOpen(false)}>
              <Minus />
            </Button>
          </div>
        </div>
        {/* Fica montado mesmo minimizado: mantém a rolagem e o aviso de resposta em andamento. */}
        {conversationId ? (
          <Chat
            key={conversationId}
            compact
            conversationId={conversationId}
            workspaceId={workspaceId}
            onUpdate={(c) => setRunning(c.status === 'running')}
            onDelete={() => {
              setRunning(false)
              setActiveChat({ workspaceId, conversationId: null })
            }}
          />
        ) : (
          <NewConversation key={workspaceId} compact workspaceId={workspaceId} workspaceName={workspaceName} onCreate={(c) => setActiveChat({ workspaceId, conversationId: c.id })} />
        )}
      </div>
      <button
        type="button"
        aria-label={open ? 'Minimizar conversa' : 'Abrir conversa'}
        title={`${open ? 'Minimizar' : 'Abrir'} conversa · arraste para mover`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={() => {
          // O clique que encerra um arraste não abre nem fecha o painel.
          if (drag.current?.moved) {
            drag.current = null
            return
          }
          drag.current = null
          setOpen((o) => !o)
        }}
        style={{ right, bottom }}
        className={cn(
          'fixed z-40 flex size-12 touch-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_20px_rgba(0,0,0,.18)] transition-transform select-none',
          dragging ? 'scale-105 cursor-grabbing' : 'hover:scale-105',
        )}
      >
        {open ? <ChevronDown className={cn('size-5', !opensUp && 'rotate-180')} /> : <MessagesSquare className="size-5" />}
        {running && !open && <span className="absolute top-0.5 right-0.5 size-3 animate-pulse rounded-full border-2 border-background bg-blue-500" />}
      </button>
    </>
  )
}
