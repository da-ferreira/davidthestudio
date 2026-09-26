import { useEffect, useState } from 'react'
import { Link, NavLink, useMatch } from 'react-router'
import { ArrowLeft, Bot, FolderGit2, LayoutGrid, Ticket } from 'lucide-react'
import type { Workspace } from '@studio/shared'
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
import { api } from '@/lib/api'

export function AppSidebar() {
  const wsId = useMatch('/w/:id/*')?.params.id

  return (
    <Sidebar>
      <SidebarHeader className="px-4 pt-4 pb-2">
        <span className="font-semibold text-[17px] tracking-[-0.03em] text-foreground">david the studio</span>
      </SidebarHeader>
      <SidebarContent>
        {wsId ? <WorkspaceNav id={wsId} /> : <GlobalNav />}
      </SidebarContent>
      <SidebarFooter className="px-4 pb-4">
        <DaemonStatus />
      </SidebarFooter>
    </Sidebar>
  )
}

function GlobalNav() {
  return (
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
          <SidebarMenuItem>
            <NavLink to="/agentes">
              {({ isActive }) => (
                <SidebarMenuButton isActive={isActive}>
                  <Bot />
                  Agentes
                </SidebarMenuButton>
              )}
            </NavLink>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function WorkspaceNav({ id }: { id: string }) {
  const [ws, setWs] = useState<Workspace | null>(null)

  useEffect(() => {
    api<Workspace[]>('/workspaces')
      .then((all) => setWs(all.find((w) => w.id === id) ?? null))
      .catch(() => setWs(null))
  }, [id])

  return (
    <SidebarGroup className="gap-3">
      <div className="flex flex-col gap-2 rounded-xl border bg-white p-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-[7px] bg-primary text-[13px] font-semibold text-primary-foreground">
            {ws?.name[0]?.toUpperCase() ?? '·'}
          </div>
          <span className="truncate font-medium">{ws?.name ?? '…'}</span>
        </div>
        <Link to="/" className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" />
          Todos os workspaces
        </Link>
      </div>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <NavLink to={`/w/${id}/tickets`}>
              {({ isActive }) => (
                <SidebarMenuButton isActive={isActive}>
                  <Ticket />
                  Tickets
                </SidebarMenuButton>
              )}
            </NavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <NavLink to={`/w/${id}/repos`}>
              {({ isActive }) => (
                <SidebarMenuButton isActive={isActive}>
                  <FolderGit2 />
                  Repositórios
                </SidebarMenuButton>
              )}
            </NavLink>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
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
