import { useEffect, useState } from 'react'
import { Link, NavLink, useMatch } from 'react-router'
import { ArrowLeft, FolderGit2, LayoutGrid, LogOut, MessageCircleQuestion, Plug, Ticket, Users } from 'lucide-react'
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
import { useAuth } from '@/lib/auth'

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
      <SidebarFooter className="gap-3 px-4 pb-4">
        <Account />
        <DaemonStatus />
      </SidebarFooter>
    </Sidebar>
  )
}

function GlobalNav() {
  const { user } = useAuth()
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
            <NavLink to="/conexoes">
              {({ isActive }) => (
                <SidebarMenuButton isActive={isActive}>
                  <Plug />
                  Conexões
                </SidebarMenuButton>
              )}
            </NavLink>
          </SidebarMenuItem>
          {user.admin && (
            <SidebarMenuItem>
              <NavLink to="/usuarios">
                {({ isActive }) => (
                  <SidebarMenuButton isActive={isActive}>
                    <Users />
                    Usuários
                  </SidebarMenuButton>
                )}
              </NavLink>
            </SidebarMenuItem>
          )}
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
            <NavLink to={`/w/${id}/perguntar`}>
              {({ isActive }) => (
                <SidebarMenuButton isActive={isActive}>
                  <MessageCircleQuestion />
                  Perguntar
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

function Account() {
  const { user, refresh } = useAuth()
  const logout = () => api('/auth/logout', { method: 'POST' }).then(refresh)

  return (
    <div className="flex items-center gap-2.5">
      <Link to="/conta" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md hover:text-foreground">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[12px] font-medium">{user.name[0]?.toUpperCase()}</div>
        <span className="truncate text-[14px]">{user.name}</span>
      </Link>
      <button type="button" aria-label="Sair" title="Sair" onClick={logout} className="text-muted-foreground hover:text-foreground">
        <LogOut className="size-4" />
      </button>
    </div>
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
