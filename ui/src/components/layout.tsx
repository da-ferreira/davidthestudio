import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppSidebar } from '@/components/app-sidebar'
import { ChatBubble } from '@/components/chat-bubble'
import { NotificationsProvider } from '@/lib/notifications'

export function Layout() {
  const navigate = useNavigate()
  // Item escolhido na janelinha do ícone no topo do Mac: o app traz esta janela e manda o link.
  useEffect(() => {
    const onOpen = (e: Event) => navigate((e as CustomEvent<string>).detail)
    window.addEventListener('studio-open', onOpen)
    return () => window.removeEventListener('studio-open', onOpen)
  }, [navigate])

  return (
    <TooltipProvider>
      <NotificationsProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <Outlet />
          </SidebarInset>
          <ChatBubble />
        </SidebarProvider>
      </NotificationsProvider>
    </TooltipProvider>
  )
}
