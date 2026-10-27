import { Link } from 'react-router'
import { Bell, CircleDot, FolderKanban } from 'lucide-react'
import type { StudioNotification } from '@studio/shared'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useNotifications } from '@/lib/notifications'
import { cn } from '@/lib/utils'

export function timeAgo(iso: string, now = Date.now()) {
  const min = Math.round((now - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  if (d < 7) return `há ${d} d`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const sourceIcon = { studio: CircleDot, openproject: FolderKanban }
export const sourceLabel = { studio: 'Studio', openproject: 'OpenProject' }

export function NotificationRow({ n, compact }: { n: StudioNotification; compact?: boolean }) {
  const Icon = sourceIcon[n.source]
  return (
    <div className="flex w-full min-w-0 items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('truncate', !n.read && 'font-medium')}>{n.title}</span>
        {n.body && <span className={cn('text-[13px] text-muted-foreground', compact ? 'truncate' : 'line-clamp-2')}>{n.body}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2 text-[12px] text-subtle">
        {timeAgo(n.createdAt)}
        <span className={cn('size-1.5 rounded-full', n.read ? 'bg-transparent' : 'bg-info')} />
      </div>
    </div>
  )
}

export function NotificationsButton() {
  const { items, unread, markRead, open } = useNotifications()
  const recent = items.slice(0, 8)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Notificações"
        title="Notificações"
        className="relative flex size-8 items-center justify-center rounded-full border bg-background text-muted-foreground outline-none transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Bell className="size-3.5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground tabular-nums">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[380px] p-0">
        <div className="flex items-center px-3 py-2.5">
          <span className="font-medium">Notificações</span>
          {unread > 0 && (
            <button type="button" onClick={() => markRead()} className="ml-auto text-[13px] text-muted-foreground hover:text-foreground">
              Marcar todas como lidas
            </button>
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        {recent.length === 0 && <div className="px-3 py-8 text-center text-[13px] text-muted-foreground">Nada por aqui ainda</div>}
        {recent.map((n) => (
          <DropdownMenuItem key={n.id} onSelect={() => open(n)} className="rounded-none px-3 py-2.5">
            <NotificationRow n={n} compact />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="m-0" />
        <DropdownMenuItem asChild className="justify-center rounded-none py-2.5 text-[13px] text-muted-foreground">
          <Link to="/notificacoes">Ver todas</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
