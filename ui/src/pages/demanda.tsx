import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { BookOpen, Check, ChevronDown, Copy, Eye, EyeOff, ExternalLink, FileText, Loader2, MessageSquare, MoreHorizontal, Paperclip, Plus, Sparkles, Terminal } from 'lucide-react'
import type { DemandaActivity, DemandaDetail, DemandaEditOptions, DemandaPatch, DemandaPerson, DemandasMeta, Workspace } from '@studio/shared'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Topbar } from '@/components/topbar'
import { Markdown } from '@/components/markdown'
import { MentionTextarea } from '@/components/mention-textarea'
import { timeAgo } from '@/components/notifications'
import { DemandaStatusBadge, DueDate, formatDate, isClosedStatus, Priority } from '@/components/demanda-badges'
import { ApiError, api } from '@/lib/api'
import { demandaClipboard } from '@/lib/demanda'
import { cn } from '@/lib/utils'

const fileSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`)

const fullDate = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <div className="text-[14px]">{children}</div>
    </div>
  )
}

function Avatar({ name }: { name: string | null }) {
  return <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-border text-[12px] font-medium">{name?.[0]?.toUpperCase() ?? '·'}</div>
}

// Mudança de campo vira uma linha discreta; a criação (primeira atividade) se resume a "criou a demanda".
function ChangeLine({ a, created }: { a: DemandaActivity; created: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex gap-3">
      <div className="flex w-7 shrink-0 justify-center pt-[7px]">
        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] text-muted-foreground">
        <div>
          <span className="font-medium text-body">{a.author ?? 'Sistema'}</span>
          {created ? (
            <>
              {' '}
              criou a demanda{' '}
              <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-0.5 hover:text-foreground">
                · detalhes
                <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
              </button>
            </>
          ) : (
            <> · {a.details.join(' · ')}</>
          )}
          <span className="text-subtle" title={fullDate(a.createdAt)}>
            {' '}
            · {timeAgo(a.createdAt)}
          </span>
        </div>
        {created && open && (
          <ul className="flex flex-col gap-0.5">
            {a.details.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Comment({ a }: { a: DemandaActivity }) {
  return (
    <div className="flex gap-3">
      <Avatar name={a.author} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[13px]">
          <span className="font-medium">{a.author ?? 'Sistema'}</span>{' '}
          <span className="text-muted-foreground" title={fullDate(a.createdAt)}>
            comentou {timeAgo(a.createdAt)}
          </span>
        </span>
        <div className="rounded-[12px] border border-line bg-background px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <Markdown text={a.comment} />
        </div>
        {a.details.length > 0 && <span className="text-[13px] text-muted-foreground">{a.details.join(' · ')}</span>}
      </div>
    </div>
  )
}

// Campo do painel: parece texto até passar o mouse, para a leitura continuar limpa.
const ghost = 'h-8 w-full -ml-2 border-transparent bg-transparent px-2 shadow-none hover:border-border focus-visible:border-border dark:bg-transparent'

// Radix Select não aceita valor vazio.
const NONE = '_ninguem'

function ChoiceField({
  value,
  options,
  onSave,
  busy,
  empty,
  render,
}: {
  value: string | null
  options: { id: string; name: string }[]
  onSave: (v: string | null) => void
  busy: boolean
  empty?: string
  render?: (o: { id: string; name: string }) => ReactNode
}) {
  // O valor atual pode não estar entre os permitidos (ex.: status de onde não há volta); entra na lista para aparecer.
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onSave(v === NONE ? null : v)} disabled={busy}>
      <SelectTrigger size="sm" className={cn(ghost, 'justify-between')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {empty !== undefined && <SelectItem value={NONE}>{empty}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {render ? render(o) : o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// Salva ao sair do campo ou no Enter; salvar a cada tecla mandaria datas pela metade (ano 0002…).
function DateField({ value, onSave, busy }: { value: string | null; onSave: (v: string | null) => void; busy: boolean }) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => setV(value ?? ''), [value])
  const commit = () => v !== (value ?? '') && onSave(v || null)
  return <Input type="date" value={v} disabled={busy} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} className={cn(ghost, 'tabular-nums')} />
}

const withCurrent = (options: { id: string; name: string }[] | undefined, current: { id: string; name: string } | null) =>
  current && !options?.some((o) => o.id === current.id) ? [current, ...(options ?? [])] : (options ?? [])

const readBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error(`Não deu para ler ${file.name}`))
    reader.readAsDataURL(file)
  })

const MAX_ATTACHMENT = 25 * 1024 * 1024

export function Demanda() {
  const { demandaId } = useParams()
  const [d, setD] = useState<DemandaDetail | null>(null)
  const [meta, setMeta] = useState<DemandasMeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [only, setOnly] = useState<'tudo' | 'comentarios'>('tudo')
  const [options, setOptions] = useState<DemandaEditOptions>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [people, setPeople] = useState<DemandaPerson[] | null>(null)
  const [mentions, setMentions] = useState<DemandaPerson[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [termWs, setTermWs] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    setD(null)
    setError(null)
    setPeople(null)
    setMentions([])
    api<DemandaDetail>(`/demandas/${demandaId}`)
      .then(setD)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Falhou'))
    api<DemandasMeta>('/demandas/meta')
      .then(setMeta)
      .catch(() => {})
  }, [demandaId])

  useEffect(() => {
    setTermWs(null)
    api<{ workspaceId: string | null }>(`/demandas/${demandaId}/terminal`)
      .then((r) => setTermWs(r.workspaceId))
      .catch(() => {})
  }, [demandaId])

  useEffect(() => {
    api<Workspace[]>('/workspaces')
      .then(setWorkspaces)
      .catch(() => {})
  }, [])

  const canEdit = !!d?.can.edit
  const lockVersion = d?.lockVersion
  // As opções mudam com o estado da demanda (ex.: status seguintes), então recarregam a cada versão.
  useEffect(() => {
    if (!canEdit) return setOptions({})
    api<DemandaEditOptions>(`/demandas/${demandaId}/opcoes`)
      .then(setOptions)
      .catch(() => setOptions({}))
  }, [demandaId, canEdit, lockVersion])

  // Toda ação devolve a demanda atualizada; em erro (inclusive conflito de versão) recarrega para mostrar o que vale.
  const run = async (key: string, fn: () => Promise<DemandaDetail>) => {
    setBusy(key)
    setActionError(null)
    try {
      setD(await fn())
      return true
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Falhou')
      api<DemandaDetail>(`/demandas/${demandaId}`)
        .then(setD)
        .catch(() => {})
      return false
    } finally {
      setBusy(null)
    }
  }

  const save = (patch: Omit<DemandaPatch, 'lockVersion'>) =>
    d &&
    run(Object.keys(patch)[0], () =>
      api<DemandaDetail>(`/demandas/${demandaId}`, {
        method: 'PATCH',
        body: { ...patch, lockVersion: d.lockVersion },
      }),
    )

  const sendComment = async () => {
    if (!comment.trim()) return
    if (
      await run('comment', () =>
        api<DemandaDetail>(`/demandas/${demandaId}/comentarios`, {
          method: 'POST',
          // Só quem continua no texto vira marcação.
          body: { text: comment, mentions: mentions.filter((p) => comment.includes(`@${p.name}`)) },
        }),
      )
    ) {
      setComment('')
      setMentions([])
    }
  }

  // O texto já escrito vira a orientação; o rascunho fica no campo para revisar antes de postar.
  const draft = async () => {
    setBusy('draft')
    setActionError(null)
    try {
      setComment((await api<{ text: string }>(`/demandas/${demandaId}/rascunho`, { method: 'POST', body: { hint: comment } })).text)
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Falhou')
    } finally {
      setBusy(null)
    }
  }

  const attach = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      if (file.size > MAX_ATTACHMENT) {
        setActionError(`${file.name} passa de 25 MB`)
        continue
      }
      await run('attach', async () =>
        api<DemandaDetail>(`/demandas/${demandaId}/anexos`, {
          method: 'POST',
          body: {
            fileName: file.name,
            contentType: file.type,
            data: await readBase64(file),
          },
        }),
      )
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  const closed = d ? isClosedStatus(d.status, meta) : false
  const activities = d?.activities.filter((a) => a.comment || a.details.length) ?? []
  const commentCount = activities.filter((a) => a.comment).length
  const shown = only === 'comentarios' ? activities.filter((a) => a.comment) : activities

  return (
    <>
      <Topbar
        crumbs={['Demandas', `#${demandaId}`]}
        actions={
          d && (
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm">
                    <Plus className="size-3.5" />
                    Criar ticket
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="text-muted-foreground">Em qual workspace?</DropdownMenuLabel>
                  {workspaces.length === 0 && <DropdownMenuItem disabled>Nenhum workspace cadastrado</DropdownMenuItem>}
                  {workspaces.map((w) => (
                    <DropdownMenuItem key={w.id} onSelect={() => navigate(`/w/${w.id}/tickets/novo?demanda=${d.id}`)}>
                      {w.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <RootTerminalButton
                workspaces={workspaces}
                current={workspaces.find((w) => w.id === termWs) ?? null}
                onOpen={(w) => navigate(`/w/${w}/terminal/${d.id}`)}
                onNew={(w) =>
                  api(`/demandas/${d.id}/terminal/nova`, { method: 'POST', body: { workspaceId: w } })
                    .then(() => navigate(`/w/${w}/terminal/${d.id}`))
                    .catch((e) => setActionError(e instanceof ApiError ? e.message : 'Falhou'))
                }
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="px-2" aria-label="Mais ações">
                    {copied ? <Check className="size-4" /> : <MoreHorizontal className="size-4" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() =>
                      navigator.clipboard.writeText(demandaClipboard(d)).then(() => {
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1500)
                      })
                    }
                  >
                    <Copy />
                    Copiar demanda
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => navigate(`/tutoriais/novo?demanda=${d.id}`)}>
                    <BookOpen />
                    Criar tutorial
                  </DropdownMenuItem>
                  {d.watching !== null && (
                    <DropdownMenuItem
                      disabled={busy === 'watch'}
                      onSelect={() =>
                        run('watch', () =>
                          api<DemandaDetail>(`/demandas/${demandaId}/observar`, {
                            method: 'POST',
                            body: { watch: !d.watching },
                          }),
                        )
                      }
                    >
                      {d.watching ? <EyeOff /> : <Eye />}
                      {d.watching ? 'Deixar de observar' : 'Observar'}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <a href={d.url} target="_blank" rel="noreferrer">
                      <ExternalLink />
                      Abrir no OpenProject
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        }
      />
      {error && <div className="px-8 py-7 text-destructive">{error}</div>}
      {!d && !error && (
        <div className="flex flex-col gap-4 px-8 py-7">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 w-full max-w-[760px]" />
        </div>
      )}
      {d && (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col gap-8 overflow-y-auto px-8 py-7">
            <div className="flex flex-col gap-2">
              <span className="text-[13px] text-muted-foreground">
                {d.type?.name}{' '}
                <a href={d.url} target="_blank" rel="noreferrer" title="Abrir no OpenProject" className="font-mono underline-offset-2 hover:text-foreground hover:underline">
                  #{d.id}
                </a>{' '}
                · {d.project?.name}
              </span>
              <h1 className="text-[26px] font-medium tracking-[-0.025em]">{d.subject}</h1>
              <span className="text-[13px] text-muted-foreground">
                Criada por {d.author ?? '—'} em {formatDate(d.createdAt)} · atualizada {timeAgo(d.updatedAt)}
              </span>
            </div>

            <section className="flex max-w-[760px] flex-col gap-3">
              <h2 className="font-medium">Descrição</h2>
              {d.description.trim() ? <Markdown text={d.description} className="text-body" /> : <span className="text-muted-foreground">Sem descrição</span>}
            </section>

            {(d.attachments.length > 0 || d.can.attach) && (
              <section className="flex max-w-[760px] flex-col gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="flex items-center gap-2 font-medium">
                    <Paperclip className="size-4 text-muted-foreground" />
                    Anexos <span className="font-normal text-muted-foreground">{d.attachments.length}</span>
                  </h2>
                  {d.can.attach && (
                    <>
                      <input ref={fileInput} type="file" multiple hidden onChange={(e) => attach(e.target.files)} />
                      <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" disabled={busy === 'attach'} onClick={() => fileInput.current?.click()}>
                        {busy === 'attach' ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                        {busy === 'attach' ? 'Enviando…' : 'Anexar'}
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  {d.attachments.map((a) => (
                    <a
                      key={a.id}
                      href={`/api/demandas/anexos/${a.id}`}
                      target="_blank"
                      rel="noreferrer"
                      title={`Abrir ${a.fileName}`}
                      className="flex w-[220px] flex-col overflow-hidden rounded-[12px] border border-line transition-colors hover:bg-surface"
                    >
                      {a.contentType.startsWith('image/') ? (
                        <img src={`/api/demandas/anexos/${a.id}`} alt="" className="h-[110px] w-full border-b border-line object-cover" />
                      ) : (
                        <div className="flex h-[110px] items-center justify-center border-b border-line bg-surface">
                          <FileText className="size-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex flex-col gap-0.5 px-3 py-2">
                        <span className="truncate text-[13px] font-medium">{a.fileName}</span>
                        <span className="truncate text-[12px] text-muted-foreground">
                          {fileSize(a.size)} · {a.author ?? '—'} · {timeAgo(a.createdAt)}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}

            <section className="flex max-w-[760px] flex-col gap-4 pb-8">
              <div className="flex items-center gap-3">
                <h2 className="font-medium">Atividade</h2>
                <Tabs value={only} onValueChange={(v) => setOnly(v as typeof only)} className="ml-auto">
                  <TabsList>
                    <TabsTrigger value="tudo">Tudo</TabsTrigger>
                    <TabsTrigger value="comentarios">
                      <MessageSquare className="size-3.5" />
                      Comentários {commentCount > 0 && <span className="text-muted-foreground">{commentCount}</span>}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              {shown.length === 0 && <span className="text-muted-foreground">{only === 'comentarios' ? 'Nenhum comentário ainda' : 'Nenhuma atividade'}</span>}
              {shown.map((a) => (a.comment ? <Comment key={a.id} a={a} /> : <ChangeLine key={a.id} a={a} created={a.id === activities[0]?.id} />))}
              {d.can.comment && (
                <div className="flex flex-col gap-2 pl-10">
                  <MentionTextarea
                    value={comment}
                    onValueChange={setComment}
                    people={people}
                    onNeedPeople={() =>
                      api<DemandaPerson[]>(`/demandas/${demandaId}/pessoas`)
                        .then(setPeople)
                        .catch(() => setPeople([]))
                    }
                    onMention={(p) => setMentions((m) => (m.some((x) => x.id === p.id) ? m : [...m, p]))}
                    onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && sendComment()}
                    placeholder="Escreva um comentário… (markdown, @ marca alguém, ⌘ + Enter envia)"
                    className="min-h-[88px]"
                    disabled={busy === 'comment' || busy === 'draft'}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] text-muted-foreground">A IA usa o que estiver escrito como ideia, ou escreve uma atualização do andamento. Nada é postado sem você clicar em Comentar.</span>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" disabled={!!busy} onClick={draft}>
                        {busy === 'draft' ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                        {busy === 'draft' ? 'Escrevendo…' : 'Escrever com IA'}
                      </Button>
                      <Button size="sm" disabled={!comment.trim() || !!busy} onClick={sendComment}>
                        {busy === 'comment' && <Loader2 className="size-3.5 animate-spin" />}
                        Comentar
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>

          <aside className="sticky top-0 flex max-h-svh w-[300px] shrink-0 flex-col gap-5 self-start overflow-y-auto border-l border-line px-6 py-7">
            {actionError && <div className="rounded-[10px] bg-danger-soft px-3 py-2 text-[13px] text-danger">{actionError}</div>}
            <Field label="Status">
              {options.status ? (
                <ChoiceField
                  value={d.status?.id ?? null}
                  options={withCurrent(options.status.options, d.status)}
                  busy={busy === 'status'}
                  onSave={(v) => v && v !== d.status?.id && save({ status: v })}
                  render={(o) => <DemandaStatusBadge status={o} meta={meta} />}
                />
              ) : (
                <DemandaStatusBadge status={d.status} meta={meta} />
              )}
            </Field>
            <Field label="Início">{options.startDate ? <DateField value={d.startDate} busy={busy === 'startDate'} onSave={(v) => save({ startDate: v })} /> : formatDate(d.startDate)}</Field>
            <Field label="Término">
              {options.dueDate ? <DateField value={d.dueDate} busy={busy === 'dueDate'} onSave={(v) => save({ dueDate: v })} /> : <DueDate date={d.dueDate} closed={closed} />}
              {options.dueDate && d.dueDate && !closed && (
                <span className="text-[12px]">
                  <DueDate date={d.dueDate} closed={closed} hintOnly />
                </span>
              )}
            </Field>
            {d.durationDays !== null && <Field label="Duração">{d.durationDays === 1 ? '1 dia útil' : `${d.durationDays} dias úteis`}</Field>}
            <Field label="Prioridade">
              {options.priority ? (
                <ChoiceField
                  value={d.priority?.id ?? null}
                  options={withCurrent(options.priority.options, d.priority)}
                  busy={busy === 'priority'}
                  onSave={(v) => v && v !== d.priority?.id && save({ priority: v })}
                  render={(o) => <Priority priority={o} />}
                />
              ) : (
                <Priority priority={d.priority} />
              )}
            </Field>
            <Field label="Atribuída a">
              {options.assignee ? (
                <ChoiceField
                  value={d.assignee?.id ?? null}
                  options={withCurrent(options.assignee.options, d.assignee)}
                  empty="Ninguém"
                  busy={busy === 'assignee'}
                  onSave={(v) => v !== (d.assignee?.id ?? null) && save({ assignee: v })}
                />
              ) : (
                (d.assignee?.name ?? '—')
              )}
            </Field>
            <Field label="Responsável">
              {options.responsible ? (
                <ChoiceField
                  value={d.responsible?.id ?? null}
                  options={withCurrent(options.responsible.options, d.responsible)}
                  empty="Ninguém"
                  busy={busy === 'responsible'}
                  onSave={(v) => v !== (d.responsible?.id ?? null) && save({ responsible: v })}
                />
              ) : (
                (d.responsible?.name ?? '—')
              )}
            </Field>
            {d.percentDone !== null && (
              <Field label="% concluído">
                {options.percentDone ? (
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={d.percentDone}
                    key={`${d.lockVersion}`}
                    disabled={busy === 'percentDone'}
                    onBlur={(e) =>
                      Number(e.target.value) !== d.percentDone &&
                      save({
                        percentDone: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                      })
                    }
                    className={cn(ghost, 'w-24')}
                  />
                ) : (
                  `${d.percentDone}%`
                )}
              </Field>
            )}
            <Field label="Projeto">{d.project?.name ?? '—'}</Field>
          </aside>
        </div>
      )}
    </>
  )
}

// Primeira vez escolhe o workspace; depois abre direto no último usado, e a setinha troca.
function RootTerminalButton({
  workspaces,
  current,
  onOpen,
  onNew,
}: {
  workspaces: Workspace[]
  current: Workspace | null
  onOpen: (workspaceId: string) => void
  onNew: (workspaceId: string) => void
}) {
  const menu = (
    <DropdownMenuContent align="end">
      {current && (
        <>
          <DropdownMenuItem onSelect={() => onNew(current.id)}>Nova sessão em {current.name}</DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuLabel className="text-muted-foreground">{current ? 'Trocar de workspace' : 'Em qual workspace?'}</DropdownMenuLabel>
      {workspaces.length === 0 && <DropdownMenuItem disabled>Nenhum workspace cadastrado</DropdownMenuItem>}
      {workspaces.map((w) => (
        <DropdownMenuItem key={w.id} onSelect={() => onOpen(w.id)}>
          {w.name}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  )
  const title = 'Abre o Claude Code na raiz do workspace, com o contexto desta demanda'
  if (!current)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" title={title}>
            <Terminal className="size-3.5" />
            Terminal na raiz
          </Button>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    )
  return (
    <div className="flex">
      <Button size="sm" variant="outline" className="rounded-r-none" title={title} onClick={() => onOpen(current.id)}>
        <Terminal className="size-3.5" />
        <span className="max-w-[160px] truncate">Terminal na raiz · {current.name}</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="-ml-px rounded-l-none px-1.5" aria-label="Trocar de workspace">
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    </div>
  )
}
