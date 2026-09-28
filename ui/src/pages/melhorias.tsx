import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import type { ImportPreview, Improvement, ImprovementImport, ImprovementStatus, Workspace } from '@studio/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/utils'

const STATUS: Record<ImprovementStatus, { label: string; className: string }> = {
  open: { label: 'Aberta', className: 'bg-info-soft text-info' },
  ticket: { label: 'Em ticket', className: 'bg-warning-soft text-warning' },
  done: { label: 'Feita', className: 'bg-success-soft text-success' },
}

const FILTERS: { id: string; label: string; statuses: ImprovementStatus[] | null }[] = [
  { id: 'pendentes', label: 'Abertas e em ticket', statuses: ['open', 'ticket'] },
  { id: 'feitas', label: 'Feitas', statuses: ['done'] },
  { id: 'todas', label: 'Todas', statuses: null },
]

const date = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

// Primeira linha que não é a marca "Seção:" que o import põe no início.
const excerpt = (d: string) => d.split('\n').find((l) => l.trim() && !l.startsWith('Seção:')) ?? ''

export function Melhorias() {
  const { id } = useParams()
  const [ws, setWs] = useState<Workspace | null>(null)
  const [items, setItems] = useState<Improvement[] | null>(null)
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<Improvement | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const filter = FILTERS.find((f) => f.id === params.get('status')) ?? FILTERS[0]
  const count = (f: (typeof FILTERS)[number]) => items?.filter((i) => !f.statuses || f.statuses.includes(i.status)).length ?? 0
  const shown = items?.filter((i) => !filter.statuses || filter.statuses.includes(i.status))

  const load = () => api<Improvement[]>(`/workspaces/${id}/improvements`).then(setItems)

  useEffect(() => {
    api<Workspace[]>('/workspaces').then((all) => setWs(all.find((w) => w.id === id) ?? null))
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const actions = (
    <>
      <Button variant="outline" onClick={() => setImporting(true)}>
        Importar de Markdown
      </Button>
      <Button onClick={() => setEditing('new')}>Nova melhoria</Button>
    </>
  )

  return (
    <>
      <Topbar crumbs={[ws?.name ?? '…', 'Melhorias']} actions={actions} />
      <div className="flex flex-1 flex-col gap-8 px-8 py-7">
        <h1 className="text-[28px] font-medium tracking-[-0.025em]">Melhorias</h1>
        {items?.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-16 text-center">
            <div className="font-medium">Nenhuma melhoria ainda</div>
            <p className="max-w-sm text-muted-foreground">Anote ideias que ficaram de fora, ou peça ao agente em Conversar para anotar.</p>
          </div>
        )}
        {!!items?.length && (
          <Tabs value={filter.id} onValueChange={(v) => setParams(v === FILTERS[0].id ? {} : { status: v }, { replace: true })}>
            <TabsList>
              {FILTERS.map((f) => (
                <TabsTrigger key={f.id} value={f.id}>
                  {f.label}
                  <span className="text-muted-foreground">{count(f)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        {!!items?.length && shown?.length === 0 && <p className="text-muted-foreground">Nenhuma melhoria neste filtro.</p>}
        {!!shown?.length && (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Título</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Autor</TableHead>
                  <TableHead>Criada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((i) => (
                  <TableRow key={i.id} className="cursor-pointer" onClick={() => setEditing(i)}>
                    <TableCell className="max-w-[560px] pl-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="truncate font-medium">{i.title}</span>
                        <span className="truncate text-[13px] text-muted-foreground">{excerpt(i.description)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS[i.status].className}>{STATUS[i.status].label}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-[12px] text-muted-foreground">
                      {i.ticketId ? (
                        <Link to={`/w/${id}/tickets/${i.ticketId}`} onClick={(e) => e.stopPropagation()} className="hover:text-foreground">
                          {i.ticketId}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{i.author ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{date(i.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <EditSheet
        key={editing === 'new' ? 'new' : editing?.id}
        workspaceId={id!}
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          load()
        }}
      />
      <ImportDialog
        workspaceId={id!}
        open={importing}
        onClose={() => setImporting(false)}
        onDone={() => {
          setImporting(false)
          load()
        }}
      />
    </>
  )
}

function EditSheet({
  workspaceId,
  item,
  onClose,
  onSaved,
}: {
  workspaceId: string
  item: Improvement | 'new' | null
  onClose: () => void
  onSaved: () => void
}) {
  const existing = item && item !== 'new' ? item : null
  const [title, setTitle] = useState(existing?.title ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [status, setStatus] = useState<ImprovementStatus>(existing?.status ?? 'open')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const base = `/workspaces/${workspaceId}/improvements`

  const run = (p: Promise<unknown>) => {
    setBusy(true)
    setError(null)
    p.then(onSaved)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Falhou'))
      .finally(() => setBusy(false))
  }
  const save = () =>
    run(
      existing
        ? api(`${base}/${existing.id}`, { method: 'PUT', body: { title, description, status } })
        : api(base, { method: 'POST', body: { title, description } }),
    )

  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-[520px] flex-col gap-0 sm:max-w-[520px]">
        <SheetHeader>
          <SheetTitle>{existing ? 'Editar melhoria' : 'Nova melhoria'}</SheetTitle>
          <SheetDescription>{existing ? `Criada por ${existing.author ?? '—'} em ${date(existing.createdAt)}.` : 'Começa como aberta.'}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-5 overflow-auto px-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="melhoria-titulo">Título</Label>
            <Input id="melhoria-titulo" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="melhoria-descricao">Descrição</Label>
            <Textarea id="melhoria-descricao" className="min-h-[240px] flex-1" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {existing && (
            <div className="flex flex-col gap-2">
              <Label>Estado</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ImprovementStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS) as ImprovementStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {error && <p className="text-[13px] text-destructive">{error}</p>}
        </div>
        <SheetFooter className="flex-row">
          {existing && (
            <Button variant="ghost" className="text-muted-foreground" disabled={busy} onClick={() => setDeleting(true)}>
              Apagar
            </Button>
          )}
          <Button className="ml-auto" disabled={!title.trim() || busy} onClick={save}>
            {existing ? 'Salvar' : 'Criar'}
          </Button>
        </SheetFooter>
        <AlertDialog open={deleting} onOpenChange={setDeleting}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar esta melhoria?</AlertDialogTitle>
              <AlertDialogDescription>Ela some para todos do workspace. Não dá para desfazer.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => existing && run(api(`${base}/${existing.id}`, { method: 'DELETE' }))}>Apagar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  )
}

function ImportDialog({ workspaceId, open, onClose, onDone }: { workspaceId: string; open: boolean; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<ImprovementImport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const url = `/workspaces/${workspaceId}/improvements/import`

  useEffect(() => {
    if (!open) return
    setError(null)
    api<ImportPreview>(url).then((p) => setText(p.text))
  }, [open, url])

  // Conta no daemon, com o mesmo parser da importação, o que seria criado e o que já existe.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      api<ImprovementImport>(url, { method: 'POST', body: { text, dryRun: true } })
        .then(setPreview)
        .catch(() => setPreview(null))
    }, 300)
    return () => clearTimeout(t)
  }, [open, text, url])

  const submit = () => {
    setBusy(true)
    setError(null)
    api<ImprovementImport>(url, { method: 'POST', body: { text } })
      .then(onDone)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Falhou'))
      .finally(() => setBusy(false))
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Importar de Markdown</DialogTitle>
          <DialogDescription>
            Cada item <code className="font-mono text-[12px]">- **Título.** descrição</code> vira uma melhoria aberta; a seção <code className="font-mono text-[12px]">## Nome</code> vai para a
            descrição. Veio preenchido com o MELHORIAS.md dos repositórios, se houver.
          </DialogDescription>
        </DialogHeader>
        <Textarea className="max-h-[50vh] min-h-[280px] font-mono text-[12px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="Cole aqui a lista em Markdown" />
        <span className={cn('text-[13px] text-muted-foreground', !preview && 'invisible')}>
          {preview && `${preview.created} ${preview.created === 1 ? 'nova' : 'novas'}, ${preview.skipped} já ${preview.skipped === 1 ? 'existe' : 'existem'}`}
        </span>
        {error && <p className="text-[13px] text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy || !preview?.created} onClick={submit}>
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
