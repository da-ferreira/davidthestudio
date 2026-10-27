import { Fragment, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { UsageButton } from '@/components/usage'
import { NotificationsButton } from '@/components/notifications'

export function Topbar({ crumbs, actions }: { crumbs: string[]; actions?: ReactNode }) {
  return (
    <header data-topbar className="flex h-12 shrink-0 items-center gap-3 border-b border-sidebar-border px-3">
      <SidebarTrigger className="text-muted-foreground" />
      <nav className="flex min-w-0 items-center gap-2 whitespace-nowrap text-muted-foreground">
        {crumbs.map((c, i) => (
          <Fragment key={c}>
            {i > 0 && <ChevronRight className="size-4 text-faint" />}
            <span className={i === crumbs.length - 1 ? 'truncate font-medium text-foreground' : 'shrink-0'}>{c}</span>
          </Fragment>
        ))}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
        <UsageButton />
        <NotificationsButton />
        {actions}
      </div>
    </header>
  )
}
