import { FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Topbar } from '@/components/topbar'

export function Workspaces() {
  return (
    <>
      <Topbar crumbs={['Workspaces']} />
      <div className="flex flex-1 flex-col gap-8 px-8 py-7">
        <h1 className="text-[28px] font-medium tracking-[-0.025em]">Workspaces</h1>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-16 text-center">
          <div className="flex size-10 items-center justify-center rounded-[10px] border bg-white shadow-xs">
            <FolderPlus className="size-[18px]" />
          </div>
          <div className="font-medium">Nenhum workspace ainda</div>
          <p className="max-w-sm text-muted-foreground">
            Registre uma pasta com seus repositórios e contexto, como <span className="font-mono text-[13px]">~/lp/agentia</span>.
          </p>
          <Button disabled className="mt-2">Registrar pasta</Button>
        </div>
      </div>
    </>
  )
}
