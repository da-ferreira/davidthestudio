import { useState } from 'react'
import type { StudioNotification } from '@studio/shared'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Topbar } from '@/components/topbar'
import { NotificationRow } from '@/components/notifications'
import { useNotifications } from '@/lib/notifications'

type Filter = 'todas' | 'nao-lidas' | StudioNotification['source']

export function Notificacoes() {
  const { items, unread, markRead, open, permission, askPermission } = useNotifications()
  const [filter, setFilter] = useState<Filter>('todas')
  const shown = items.filter((n) => (filter === 'todas' ? true : filter === 'nao-lidas' ? !n.read : n.source === filter))

  return (
    <>
      <Topbar crumbs={['Notificações']} />
      <div className="flex flex-1 flex-col gap-6 px-8 py-7">
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-[28px] font-medium tracking-[-0.025em]">Notificações</h1>
            <span className="text-muted-foreground">Avisos do studio e do OpenProject num lugar só.</span>
          </div>
          {unread > 0 && (
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => markRead()}>
              Marcar todas como lidas
            </Button>
          )}
        </div>
        {permission === 'default' && (
          <div className="flex max-w-[860px] items-center gap-3 rounded-[14px] border border-line px-5 py-3.5">
            <span className="text-[13px] text-muted-foreground">Receba os avisos nas notificações do sistema mesmo com o studio em segundo plano.</span>
            <Button size="sm" className="ml-auto" onClick={askPermission}>
              Ativar
            </Button>
          </div>
        )}
        {permission === 'denied' && (
          <span className="text-[13px] text-muted-foreground">As notificações do sistema estão bloqueadas para o studio; libere nos ajustes do navegador ou do macOS.</span>
        )}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="todas">Todas</TabsTrigger>
            <TabsTrigger value="nao-lidas">Não lidas{unread > 0 && ` · ${unread}`}</TabsTrigger>
            <TabsTrigger value="openproject">OpenProject</TabsTrigger>
            <TabsTrigger value="studio">Studio</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex max-w-[860px] flex-col divide-y divide-line rounded-[14px] border border-line">
          {shown.length === 0 && <div className="px-5 py-12 text-center text-muted-foreground">Nenhuma notificação</div>}
          {shown.map((n) => (
            <button key={n.id} type="button" onClick={() => open(n)} className="px-5 py-3.5 text-left transition-colors hover:bg-surface">
              <NotificationRow n={n} />
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
