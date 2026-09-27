import { Fragment, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { SidebarTrigger } from '@/components/ui/sidebar'

export function Topbar({ crumbs, actions }: { crumbs: string[]; actions?: ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-sidebar-border px-3">
      <SidebarTrigger className="text-muted-foreground" />
      <nav className="flex items-center gap-2 text-muted-foreground">
        {crumbs.map((c, i) => (
          <Fragment key={c}>
            {i > 0 && <ChevronRight className="size-4 text-faint" />}
            <span className={i === crumbs.length - 1 ? 'font-medium text-foreground' : ''}>{c}</span>
          </Fragment>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </header>
  )
}
