import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { WorkspaceDetail } from '@studio/shared'
import { Topbar } from '@/components/topbar'
import { TerminalPanel } from '@/components/terminal-panel'
import { api } from '@/lib/api'

export function RootTerminal() {
  const { id, demanda } = useParams()
  const [ws, setWs] = useState<WorkspaceDetail | null>(null)

  useEffect(() => {
    api<WorkspaceDetail>(`/workspaces/${id}`).then(setWs)
  }, [id])

  return (
    <>
      <Topbar crumbs={[ws?.name ?? '…', 'Terminal na raiz', `#${demanda}`]} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-8 py-5">
        <p className="text-[13px] text-muted-foreground">
          Claude Code em <span className="font-mono">{ws?.path ?? '…'}</span>, com o contexto da{' '}
          <Link to={`/demandas/${demanda}`} className="underline underline-offset-2">
            demanda #{demanda}
          </Link>
          . Aqui ele mexe direto nos repositórios do workspace, sem worktree.
        </p>
        <TerminalPanel query={`workspace=${id}&demanda=${demanda}`} />
      </div>
    </>
  )
}
