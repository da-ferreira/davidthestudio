import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { FolderPlus, GitBranch, Trash2 } from 'lucide-react'
import type { ImportResult, Workspace } from '@studio/shared'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ApiError, api } from '@/lib/api'

export function Workspaces() {
  const [items, setItems] = useState<Workspace[] | null>(null)
  const [open, setOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [removing, setRemoving] = useState<Workspace | null>(null)

  const load = () => api<Workspace[]>('/workspaces').then(setItems).catch(() => setItems([]))
  useEffect(() => {
    load()
  }, [])

  return (
    <>
      <Topbar
        crumbs={['Workspaces']}
        actions={
          items?.length ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(true)}>
                Registrar pasta
              </Button>
              <Button onClick={() => setImporting(true)}>Importar do git</Button>
            </div>
          ) : null
        }
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
              <span className="font-mono text-[13px]">~/lp/agentia</span>, ou importe o repositório de contexto pela URL do git.
            </p>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" onClick={() => setOpen(true)}>
                Registrar pasta
              </Button>
              <Button onClick={() => setImporting(true)}>Importar do git</Button>
            </div>
          </div>
        )}
        {!!items?.length && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {items.map((w) => (
              <Link
                key={w.id}
                to={`/w/${w.id}/tickets`}
                className="group relative flex flex-col gap-3 rounded-xl border p-5 transition-colors hover:border-neutral-300"
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover ${w.name}`}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={(e) => {
                    e.preventDefault()
                    setRemoving(w)
                  }}
                >
                  <Trash2 className="text-muted-foreground" />
                </Button>
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
      <ImportDialog open={importing} onOpenChange={setImporting} onDone={load} />
      <RemoveWorkspaceDialog ws={removing} onClose={() => setRemoving(null)} onDone={setItems} />
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

function ImportDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const openWorkspace = (id: string) => navigate(`/w/${id}/repos`)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await api<ImportResult>('/workspaces/import', { method: 'POST', body: { url } })
      onDone()
      if (r.failed.length) setResult(r)
      else openWorkspace(r.workspace.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return
        onOpenChange(v)
        setError(null)
        setResult(null)
        setUrl('')
      }}
    >
      <DialogContent>
        {result ? (
          <div className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>{result.workspace.name} importado, com pendências</DialogTitle>
              <DialogDescription>Estes repositórios não foram clonados. Ficam como ausentes e dá para clonar de novo na tela de repositórios.</DialogDescription>
            </DialogHeader>
            <ul className="flex flex-col gap-2 text-[13px]">
              {result.failed.map((f) => (
                <li key={f.name}>
                  <span className="font-mono">{f.name}</span>
                  <span className="block break-words text-muted-foreground">{f.error}</span>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button onClick={() => openWorkspace(result.workspace.id)}>Abrir workspace</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Importar do git</DialogTitle>
              <DialogDescription>
                URL do repositório de contexto do workspace. O studio clona ele e cada repositório listado no workspace.json, usando o seu GitHub da tela Conexões.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ws-url">URL</Label>
              <Input
                id="ws-url"
                autoFocus
                placeholder="https://github.com/empresa/agentia.git"
                className="font-mono text-[13px]"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              {error && <p className="break-words text-[13px] text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!url.trim() || busy}>
                {busy ? 'Clonando os repositórios…' : 'Importar'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RemoveWorkspaceDialog({ ws, onClose, onDone }: { ws: Workspace | null; onClose: () => void; onDone: (items: Workspace[]) => void }) {
  const [reasons, setReasons] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      onDone(await api<Workspace[]>(`/workspaces/${ws!.id}`, { method: 'DELETE' }))
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.reasons.length) setReasons(err.reasons)
      else setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const blocked = reasons.length > 0

  return (
    <AlertDialog
      open={!!ws}
      onOpenChange={(v) => {
        if (v) return
        onClose()
        setReasons([])
        setError(null)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover {ws?.name} do studio?</AlertDialogTitle>
          <AlertDialogDescription>
            {blocked
              ? 'Não dá para remover: há tickets com worktrees abertas.'
              : `A pasta ${ws?.path} e os repositórios ficam no disco. Os tickets deste workspace e o histórico deles saem do studio.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {blocked && (
          <ul className="list-disc pl-5 text-[13px]">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {error && <p className="text-[13px] text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>{blocked ? 'Fechar' : 'Cancelar'}</AlertDialogCancel>
          {!blocked && (
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                remove()
              }}
            >
              {busy ? 'Removendo…' : 'Remover'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
