import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { FileText, RefreshCw, Settings2, Trash2 } from 'lucide-react'
import type { ContextFiles, RepoStatus, WorkspaceDetail } from '@studio/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { cn } from '@/lib/utils'

export function Repositorios() {
  const { id } = useParams()
  const [ws, setWs] = useState<WorkspaceDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<RepoStatus | null>(null)
  const [configuring, setConfiguring] = useState<RepoStatus | null>(null)
  const [scanning, setScanning] = useState(false)
  const [cloning, setCloning] = useState<string | null>(null)
  const [cloneError, setCloneError] = useState<{ name: string; text: string } | null>(null)

  const cloneMissing = (name: string) => {
    setCloning(name)
    setCloneError(null)
    api<WorkspaceDetail>(`/workspaces/${ws!.id}/repos/${name}/clone`, { method: 'POST' })
      .then(setWs)
      .catch((e) => setCloneError({ name, text: e instanceof ApiError ? e.message : 'Falha no git clone' }))
      .finally(() => setCloning(null))
  }

  const rescan = () => {
    setScanning(true)
    api<WorkspaceDetail>(`/workspaces/${id}/rescan`, { method: 'POST' })
      .then(setWs)
      .catch((e) => setError(e.message))
      .finally(() => setScanning(false))
  }

  const load = useCallback(() => {
    api<WorkspaceDetail>(`/workspaces/${id}`).then(setWs).catch((e) => setError(e.message))
  }, [id])
  useEffect(load, [load])

  return (
    <>
      <Topbar
        crumbs={[ws?.name ?? '…', 'Repositórios']}
        actions={
          ws && (
            <>
              <Button variant="outline" disabled={scanning} onClick={rescan}>
                <RefreshCw className={cn(scanning && 'animate-spin')} />
                Reescanear
              </Button>
              <Button onClick={() => setAdding(true)}>Adicionar repositório</Button>
            </>
          )
        }
      />
      <div className="flex flex-1 flex-col gap-8 px-8 py-7">
        <div>
          <h1 className="text-[28px] font-medium tracking-[-0.025em]">Repositórios</h1>
          {ws && <p className="font-mono text-[12px] text-muted-foreground">{ws.path}</p>}
        </div>
        {error && <p className="text-destructive">{error}</p>}
        {ws && <ContextCard ws={ws} onDone={setWs} />}
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
                  <TableHead>Testes</TableHead>
                  <TableHead>Remote</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ws.repos.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="pl-4 font-medium">{r.name}</TableCell>
                    <TableCell className="font-mono text-[12px]">{r.branch ?? '—'}</TableCell>
                    <TableCell>
                      <RepoState repo={r} />
                      {cloneError?.name === r.name && <p className="mt-1 max-w-[280px] text-[12px] break-words whitespace-normal text-destructive">{cloneError.text}</p>}
                    </TableCell>
                    <TableCell className="font-mono text-[12px]">
                      {r.test ?? <span className="text-muted-foreground">—</span>}
                      {r.hasEnv && <Badge className="ml-2 bg-blue-50 font-sans text-blue-700">.env</Badge>}
                    </TableCell>
                    <TableCell className="max-w-[320px] truncate font-mono text-[12px] text-muted-foreground">
                      {r.remote ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {!r.present && r.remote && (
                        <Button variant="outline" size="sm" disabled={!!cloning} onClick={() => cloneMissing(r.name)}>
                          {cloning === r.name ? 'Clonando…' : 'Clonar'}
                        </Button>
                      )}
                      {r.present && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Configurar ${r.name}`} onClick={() => setConfiguring(r)}>
                          <Settings2 className="text-muted-foreground" />
                        </Button>
                      )}
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
      {ws && <RepoConfigSheet repo={configuring} wsId={ws.id} onClose={() => setConfiguring(null)} onDone={setWs} />}
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

function RepoConfigSheet({
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
  const [test, setTest] = useState('')
  const [env, setEnv] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setError(null)
    setEnv(null)
    if (!repo) return
    setTest(repo.test ?? '')
    api<{ content: string | null }>(`/workspaces/${wsId}/repos/${encodeURIComponent(repo.name)}/env`)
      .then((r) => setEnv(r.content ?? ''))
      .catch((e) => setError(e.message))
  }, [repo, wsId])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!repo) return
    const base = `/workspaces/${wsId}/repos/${encodeURIComponent(repo.name)}`
    setBusy(true)
    setError(null)
    try {
      await api(`${base}/test`, { method: 'PUT', body: { command: test.trim() || null } })
      onDone(await api<WorkspaceDetail>(`${base}/env`, { method: 'PUT', body: { content: env ?? '' } }))
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={!!repo} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-[480px]">
        <form onSubmit={submit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>{repo?.name}</SheetTitle>
            <SheetDescription>Como os testes deste repositório rodam nos tickets.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-6 overflow-auto px-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="repo-test">Comando de teste</Label>
              <Input
                id="repo-test"
                placeholder="npm test"
                className="font-mono text-[13px]"
                value={test}
                onChange={(e) => setTest(e.target.value)}
              />
              <span className="text-[12.5px] text-muted-foreground">
                Roda na pasta do repositório dentro do ticket. Passa se terminar com código 0. Vazio: o repositório fica sem testes.
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="repo-env">.env</Label>
              <Textarea
                id="repo-env"
                disabled={env === null}
                placeholder="DATABASE_URL=..."
                spellCheck={false}
                className="min-h-[220px] resize-y font-mono text-[12.5px]"
                value={env ?? ''}
                onChange={(e) => setEnv(e.target.value)}
              />
              <span className="text-[12.5px] text-muted-foreground">
                Fica criptografado no studio, fora do git e do repositório. Entra no processo dos testes; o agente não vê.
              </span>
            </div>
            {error && <p className="text-[13px] text-destructive">{error}</p>}
          </div>
          <SheetFooter>
            <Button type="submit" disabled={busy || env === null}>
              {busy ? 'Salvando…' : 'Salvar'}
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

const CONTEXT: Record<ContextFiles, { text: string; action?: string }> = {
  unified: { text: 'Claude e Codex leem o mesmo AGENTS.md; o CLAUDE.md só importa ele.' },
  claude: {
    text: 'Só existe CLAUDE.md, que o Codex não lê. Unificar move o conteúdo para AGENTS.md e deixa no CLAUDE.md só o import.',
    action: 'Unificar',
  },
  agents: { text: 'Só existe AGENTS.md, que o Claude não lê sozinho. Unificar cria um CLAUDE.md que importa ele.', action: 'Unificar' },
  both: { text: 'CLAUDE.md e AGENTS.md têm conteúdos próprios. Junte os dois no AGENTS.md e deixe no CLAUDE.md só a linha @AGENTS.md.' },
  none: { text: 'Sem CLAUDE.md nem AGENTS.md na raiz do workspace.' },
}

function ContextCard({ ws, onDone }: { ws: WorkspaceDetail; onDone: (ws: WorkspaceDetail) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const c = CONTEXT[ws.context]

  const unify = () => {
    setBusy(true)
    setError(null)
    api<WorkspaceDetail>(`/workspaces/${ws.id}/context/unify`, { method: 'POST' })
      .then(onDone)
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  return (
    <div className="flex items-center gap-3.5 rounded-xl border px-4 py-3.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-[#f4f4f4]">
        <FileText className="size-4 text-muted-foreground" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2 font-medium">
          Contexto dos agentes
          {ws.context === 'unified' && <Badge className="bg-green-50 text-green-700">unificado</Badge>}
        </div>
        <span className="text-[13px] text-muted-foreground">{c.text}</span>
        {error && <span className="text-[13px] text-destructive">{error}</span>}
      </div>
      {c.action && (
        <Button variant="outline" size="sm" disabled={busy} onClick={unify}>
          {busy ? 'Unificando…' : c.action}
        </Button>
      )}
    </div>
  )
}
