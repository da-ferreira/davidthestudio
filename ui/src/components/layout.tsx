import { Outlet } from 'react-router'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppSidebar } from '@/components/app-sidebar'
import { ChatBubble } from '@/components/chat-bubble'

export function Layout() {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <Outlet />
        </SidebarInset>
        <ChatBubble />
      </SidebarProvider>
    </TooltipProvider>
  )
}
