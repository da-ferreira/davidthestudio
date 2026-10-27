import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import type { NotificationList, StudioNotification, WsMessage } from '@studio/shared'
import { api } from '@/lib/api'

type Ctx = {
  items: StudioNotification[]
  unread: number
  markRead: (ids?: string[]) => Promise<void>
  open: (n: StudioNotification) => void
  // Permissão das notificações do sistema (Central de Notificações no macOS).
  permission: NotificationPermission | 'unsupported'
  askPermission: () => void
}

const NotificationsContext = createContext<Ctx | null>(null)

export const useNotifications = () => useContext(NotificationsContext)!

const supported = typeof window !== 'undefined' && 'Notification' in window

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [list, setList] = useState<NotificationList>({ items: [], unread: 0 })
  const [permission, setPermission] = useState<Ctx['permission']>(supported ? Notification.permission : 'unsupported')

  const load = useCallback(() => api<NotificationList>('/notifications').then(setList).catch(() => {}), [])

  const markRead = useCallback(async (ids?: string[]) => {
    setList(await api<NotificationList>('/notifications/read', { method: 'POST', body: ids ? { ids } : {} }))
  }, [])

  const open = useCallback(
    (n: StudioNotification) => {
      if (!n.read) markRead([n.id])
      if (n.link) navigate(n.link)
    },
    [markRead, navigate],
  )

  // Só avisa no sistema quando a pessoa não está olhando para a tela.
  const showSystem = useCallback(
    (n: StudioNotification) => {
      if (!supported || Notification.permission !== 'granted' || (document.visibilityState === 'visible' && document.hasFocus())) return
      const sys = new Notification(n.title, { body: n.body, tag: n.id })
      sys.onclick = () => {
        window.focus()
        open(n)
      }
    },
    [open],
  )

  useEffect(() => {
    load()
    let sock: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let closed = false
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      sock = new WebSocket(`${proto}://${location.host}/ws/notifications`)
      sock.onmessage = (msg) => {
        const m = JSON.parse(msg.data) as WsMessage
        if (m.kind !== 'notification') return
        setList((l) => ({ items: [m.notification, ...l.items], unread: l.unread + 1 }))
        showSystem(m.notification)
      }
      // O daemon reiniciou ou a rede caiu: reconecta e relê o que chegou no meio.
      sock.onclose = () => {
        if (closed) return
        retry = setTimeout(() => {
          load()
          connect()
        }, 3000)
      }
    }
    connect()
    return () => {
      closed = true
      clearTimeout(retry)
      sock?.close()
    }
  }, [load, showSystem])

  const askPermission = () => {
    if (supported) Notification.requestPermission().then(setPermission)
  }

  return (
    <NotificationsContext.Provider value={{ items: list.items, unread: list.unread, markRead, open, permission, askPermission }}>{children}</NotificationsContext.Provider>
  )
}
