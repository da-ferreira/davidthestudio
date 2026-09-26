import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { Trash2 } from 'lucide-react'
import type { RepoStatus, WorkspaceDetail } from '@studio/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
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
import { Topbar } from '@/components/topbar'
import { api, ApiError } from '@/lib/api'

export function Repositorios() {
  const { id } = useParams()
  const [ws, setWs] = useState<WorkspaceDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<RepoStatus | null>(null)

  const load = useCallback(() => {
    api<WorkspaceDetail>(`/workspaces/${id}`).then(setWs).catch((e) => setError(e.message))
  }, [id])
  useEffect(load, [load])

  return (
    <>
      <Topbar
        crumbs={[ws?.name ?? '…', 'Repositórios']}
        actions={ws && <Button onClick={() => setAdding(true)}>Adicionar repositório</Button>}
      />
      <div className="flex flex-1 flex-col gap-8 px-8 py-7">
        <div>
          <h1 className="text-[28px] font-medium tracking-[-0.025em]">Repositórios</h1>
          {ws && <p className="font-mono text-[12px] text-muted-foreground">{ws.path}</p>}
        </div>
        {error && <p className="text-destructive">{error}</p>}
        {ws && ws.repos.length === 0 && (
          <div className="rounded-2xl border border-dashed py-16 text-center text-muted-foreground">
            Nenhum repositório neste workspace.
          </div>
        )}
        {!!ws?.repos.length && (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Nome</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Remote</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ws.repos.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="pl-4 font-medium">{r.name}</TableCell>
                    <TableCell className="font-mono text-[12px]">{r.branch ?? '—'}</TableCell>
                    <TableCell>
                      <RepoState repo={r} />
                    </TableCell>
                    <TableCell className="max-w-[320px] truncate font-mono text-[12px] text-muted-foreground">
                      {r.remote ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" aria-label={`Remover ${r.name}`} onClick={() => setRemoving(r)}>
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      {ws && <AddRepoSheet open={adding} onOpenChange={setAdding} wsId={ws.id} onDone={setWs} />}
      {ws && <RemoveRepoDialog repo={removing} wsId={ws.id} onClose={() => setRemoving(null)} onDone={setWs} />}
    </>
  )
}

function RepoState({ repo }: { repo: RepoStatus }) {
  if (!repo.present) return <Badge variant="destructive">ausente</Badge>
  const badges = []
  if (repo.changes) badges.push(<Badge key="c" variant="secondary">{repo.changes} {repo.changes === 1 ? 'alteração' : 'alterações'}</Badge>)
  if (repo.unpushed.length) badges.push(<Badge key="u" variant="secondary">sem push</Badge>)
  if (!badges.length) return <Badge variant="outline">limpo</Badge>
  return <div className="flex gap-1.5">{badges}</div>
}

function AddRepoSheet({
  open,
  onOpenChange,
  wsId,
  onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  wsId: string
  onDone: (ws: WorkspaceDetail) => void
}) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onDone(await api<WorkspaceDetail>(`/workspaces/${wsId}/repos`, { method: 'POST', body: { url } }))
      setUrl('')
      onOpenChange(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); setError(null) }}>
      <SheetContent>
        <form onSubmit={submit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>Adicionar repositório</SheetTitle>
            <SheetDescription>O repositório é clonado dentro da pasta do workspace.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4">
            <Label htmlFor="repo-url">URL do git</Label>
            <Input
              id="repo-url"
              autoFocus
              placeholder="git@github.com:org/repo.git"
              className="font-mono text-[13px]"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            {error && <pre className="whitespace-pre-wrap text-[12px] text-destructive">{error}</pre>}
          </div>
          <SheetFooter>
            <Button type="submit" disabled={!url.trim() || busy}>
              {busy ? 'Clonando…' : 'Clonar'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function RemoveRepoDialog({
  repo,
  wsId,
  onClose,
  onDone,
}: {
  repo: RepoStatus | null
  wsId: string
  onClose: () => void
  onDone: (ws: WorkspaceDetail) => void
}) {
  const [reasons, setReasons] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setReasons(null)
    setError(null)
    if (!repo) return
    api<{ reasons: string[] }>(`/workspaces/${wsId}/repos/${encodeURIComponent(repo.name)}/removal`)
      .then((r) => setReasons(r.reasons))
      .catch((e) => setError(e.message))
  }, [repo, wsId])

  async function remove() {
    if (!repo) return
    setBusy(true)
    try {
      onDone(await api<WorkspaceDetail>(`/workspaces/${wsId}/repos/${encodeURIComponent(repo.name)}`, { method: 'DELETE' }))
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.reasons.length) setReasons(err.reasons)
      else setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const blocked = !!reasons?.length

  return (
    <AlertDialog open={!!repo} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover {repo?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {blocked
              ? 'Não dá para remover: há trabalho que seria perdido.'
              : 'A pasta do repositório será apagada do disco e ele sai do workspace.json.'}
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
              disabled={reasons === null || busy}
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
