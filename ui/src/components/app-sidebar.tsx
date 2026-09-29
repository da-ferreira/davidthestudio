import { useEffect, useState } from 'react'
import { Link, NavLink, useMatch } from 'react-router'
import { ArrowLeft, FolderGit2, LayoutGrid, Lightbulb, LogOut, MessagesSquare, Monitor, Moon, Plug, Sun, Ticket, Users } from 'lucide-react'
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getTheme, setTheme, type Theme } from '@/lib/theme'
import { UsageButton } from '@/components/usage'

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
        <UsageButton />
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
      <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
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
            <NavLink to={`/w/${id}/conversar`}>
              {({ isActive }) => (
                <SidebarMenuButton isActive={isActive}>
                  <MessagesSquare />
                  Conversar
                </SidebarMenuButton>
              )}
            </NavLink>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <NavLink to={`/w/${id}/melhorias`}>
              {({ isActive }) => (
                <SidebarMenuButton isActive={isActive}>
                  <Lightbulb />
                  Melhorias
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
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-border text-[12px] font-medium">{user.name[0]?.toUpperCase()}</div>
        <span className="truncate text-[14px]">{user.name}</span>
      </Link>
      <ThemeMenu />
      <button type="button" aria-label="Sair" title="Sair" onClick={logout} className="text-muted-foreground hover:text-foreground">
        <LogOut className="size-4" />
      </button>
    </div>
  )
}

const themeIcon = { light: Sun, dark: Moon, system: Monitor }

function ThemeMenu() {
  const [theme, setThemeState] = useState(getTheme)
  const Icon = themeIcon[theme]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Aparência" title="Aparência" className="text-muted-foreground outline-none hover:text-foreground">
        <Icon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-36">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(v) => {
            setTheme(v as Theme)
            setThemeState(v as Theme)
          }}
        >
          <DropdownMenuRadioItem value="light">Claro</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Escuro</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">Sistema</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
      <span className={cn('size-2 rounded-full', ok === null ? 'bg-line-strong' : ok ? 'bg-green-500' : 'bg-red-500')} />
      {ok === false ? 'Daemon fora do ar' : 'Local'}
    </div>
  )
}
