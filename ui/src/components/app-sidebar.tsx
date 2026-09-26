import { useEffect, useState } from 'react'
import { NavLink } from 'react-router'
import { LayoutGrid } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader className="px-4 pt-4 pb-2">
        <span className="font-semibold text-[17px] tracking-[-0.03em] text-foreground">david the studio</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <NavLink to="/" end>
                  {({ isActive }) => (
                    <SidebarMenuButton isActive={isActive}>
                      <LayoutGrid />
                      Workspaces
                    </SidebarMenuButton>
                  )}
                </NavLink>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-4 pb-4">
        <DaemonStatus />
      </SidebarFooter>
    </Sidebar>
  )
}

function DaemonStatus() {
  const [ok, setOk] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => setOk(r.ok))
      .catch(() => setOk(false))
  }, [])

  return (
    <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <span className={cn('size-2 rounded-full', ok === null ? 'bg-neutral-300' : ok ? 'bg-green-500' : 'bg-red-500')} />
      {ok === false ? 'Daemon fora do ar' : 'Local'}
    </div>
  )
}
