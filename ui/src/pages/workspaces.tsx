import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { FolderPlus, GitBranch } from 'lucide-react'
import type { Workspace } from '@studio/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Topbar } from '@/components/topbar'
import { api } from '@/lib/api'

export function Workspaces() {
  const [items, setItems] = useState<Workspace[] | null>(null)
  const [open, setOpen] = useState(false)

  const load = () => api<Workspace[]>('/workspaces').then(setItems).catch(() => setItems([]))
  useEffect(() => {
    load()
  }, [])

  return (
    <>
      <Topbar
        crumbs={['Workspaces']}
        actions={items?.length ? <Button onClick={() => setOpen(true)}>Registrar pasta</Button> : null}
      />
      <div className="flex flex-1 flex-col gap-8 px-8 py-7">
        <h1 className="text-[28px] font-medium tracking-[-0.025em]">Workspaces</h1>
        {items?.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-16 text-center">
            <div className="flex size-10 items-center justify-center rounded-[10px] border bg-white shadow-xs">
              <FolderPlus className="size-[18px]" />
            </div>
            <div className="font-medium">Nenhum workspace ainda</div>
            <p className="max-w-sm text-muted-foreground">
              Registre uma pasta com seus repositórios e contexto, como{' '}
              <span className="font-mono text-[13px]">~/lp/agentia</span>.
            </p>
            <Button className="mt-2" onClick={() => setOpen(true)}>
              Registrar pasta
            </Button>
          </div>
        )}
        {!!items?.length && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {items.map((w) => (
              <Link
                key={w.id}
                to={`/w/${w.id}/tickets`}
                className="flex flex-col gap-3 rounded-xl border p-5 transition-colors hover:border-neutral-300"
              >
                <div className="flex size-9 items-center justify-center rounded-[9px] bg-primary text-[15px] font-semibold text-primary-foreground">
                  {w.name[0]?.toUpperCase()}
                </div>
                <div>
                  <div className="font-medium">{w.name}</div>
                  <div className="truncate font-mono text-[12px] text-muted-foreground">{w.path}</div>
                </div>
                <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <GitBranch className="size-3.5" />
                  {w.repoCount} {w.repoCount === 1 ? 'repositório' : 'repositórios'}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <RegisterDialog open={open} onOpenChange={setOpen} onDone={load} />
    </>
  )
}

function RegisterDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/workspaces', { method: 'POST', body: { path } })
      setPath('')
      onOpenChange(false)
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); setError(null) }}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Registrar pasta</DialogTitle>
            <DialogDescription>
              Os repositórios git dentro dela são detectados e listados no workspace.json.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ws-path">Caminho</Label>
            <Input
              id="ws-path"
              autoFocus
              placeholder="~/lp/agentia"
              className="font-mono text-[13px]"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
            {error && <p className="text-[13px] text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!path.trim() || busy}>
              {busy ? 'Registrando…' : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
