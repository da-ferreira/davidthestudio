import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Download, FileDown, ImagePlus, Loader2, Paperclip, Trash2 } from 'lucide-react'
import type { Tutorial as TutorialData, TutorialShot } from '@studio/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
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
import { TUTORIAL_STATUS } from '@/pages/tutoriais'
import { ApiError, api } from '@/lib/api'
import { ACCEPTED, checkFile, imageUrl, uploadImage } from '@/lib/images'
import { cn } from '@/lib/utils'

const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Falhou')

export function Tutorial() {
  const { tutorialId } = useParams()
  const navigate = useNavigate()
  const [t, setT] = useState<TutorialData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<'attach' | 'delete' | null>(null)
  const [attached, setAttached] = useState(false)
  const [busy, setBusy] = useState(false)
  const [request, setRequest] = useState('')
  // Muda a cada montagem, para o preview recarregar.
  const [version, setVersion] = useState(0)
  const working = t?.status === 'planning' || t?.status === 'writing'
  const editable = !!t && !working && !!t.shots.length

  useEffect(() => {
    api<TutorialData>(`/tutoriais/${tutorialId}`).then(setT, (e) => setError(message(e)))
  }, [tutorialId])

  // O agente roda no daemon sem canal próprio: enquanto trabalha, a tela consulta a cada 2 s.
  useEffect(() => {
    if (!working) return
    const timer = setInterval(() => {
      api<TutorialData>(`/tutoriais/${tutorialId}`).then((next) => {
        setT(next)
        if (next.status === 'done') setVersion((v) => v + 1)
      })
    }, 2000)
    return () => clearInterval(timer)
  }, [tutorialId, working])

  const current = useRef(t)
  current.current = t

  async function attach(index: number, file: File) {
    const problem = checkFile(file)
    if (problem) return setActionError(problem)
    setActionError(null)
    setUploading(index)
    try {
      const image = await uploadImage(file)
      setT(await api<TutorialData>(`/tutoriais/${tutorialId}/prints/${index}`, { method: 'PUT', body: { image } }))
    } catch (e) {
      setActionError(message(e))
    } finally {
      setUploading(null)
    }
  }

  // Colar (⌘V / Ctrl+V) em qualquer lugar: vai para o print sob o mouse (inclusive trocando) ou para o primeiro sem imagem.
  const hovered = useRef<number | null>(null)
  useEffect(() => {
    if (!editable) return
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable]')) return
      // Print copiado no Mac (⌘⇧⌃4) às vezes vem só como item, sem estar em files.
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'))
      const blob = e.clipboardData?.files[0] ?? item?.getAsFile()
      if (!blob) return
      e.preventDefault()
      const index = hovered.current ?? current.current?.shots.findIndex((s) => !s.image) ?? -1
      if (index < 0) return setActionError('Todos os prints já têm imagem: passe o mouse sobre o que quer trocar e cole de novo.')
      const file = blob.name ? blob : new File([blob], `print-${index + 1}.${blob.type.split('/')[1] || 'png'}`, { type: blob.type })
      attach(index, file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable])

  async function run(fn: () => Promise<TutorialData | void>) {
    setBusy(true)
    setActionError(null)
    try {
      const next = await fn()
      if (next) setT(next)
    } catch (e) {
      setActionError(message(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = (index: number) => run(() => api<TutorialData>(`/tutoriais/${tutorialId}/prints/${index}`, { method: 'PUT', body: { image: null } }))
  const sendAdjust = () =>
    run(async () => {
      const next = await api<TutorialData>(`/tutoriais/${tutorialId}/ajuste`, { method: 'POST', body: { text: request } })
      setRequest('')
      return next
    })
  const generate = () => run(() => api<TutorialData>(`/tutoriais/${tutorialId}/gerar`, { method: 'POST' }))

  if (error) return <><Topbar crumbs={['Tutoriais']} /><div className="px-8 py-7 text-destructive">{error}</div></>
  if (!t)
    return (
      <>
        <Topbar crumbs={['Tutoriais']} />
        <div className="flex flex-col gap-4 px-8 py-7">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 w-full max-w-[760px]" />
        </div>
      </>
    )

  const withImage = t.shots.filter((s) => s.image).length
  const doc = `/api/tutoriais/${t.id}/documento`

  return (
    <>
      <Topbar
        crumbs={['Tutoriais', t.title]}
        actions={
          <div className="flex items-center gap-2">
            {t.ready && (
              <>
                <Button size="sm" variant="outline" asChild>
                  <a href={`${doc}?baixar=1`}>
                    <Download className="size-3.5" />
                    Baixar HTML
                  </a>
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => printSinglePage(doc))}>
                  <FileDown className="size-3.5" />
                  Baixar PDF
                </Button>
                {t.demanda && (
                  <Button size="sm" variant="outline" disabled={busy || attached} onClick={() => setConfirm('attach')}>
                    <Paperclip className="size-3.5" />
                    {attached ? 'Anexado na demanda' : 'Anexar na demanda'}
                  </Button>
                )}
              </>
            )}
            <Button size="icon-sm" variant="ghost" className="text-muted-foreground" disabled={working} aria-label="Apagar tutorial" title="Apagar tutorial" onClick={() => setConfirm('delete')}>
              <Trash2 />
            </Button>
          </div>
        }
      />
      <div className="flex flex-1 flex-col gap-8 px-8 py-7">
        <div className="flex max-w-[760px] flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-[28px] font-medium tracking-[-0.025em]">{t.title}</h1>
            <Badge className={TUTORIAL_STATUS[t.status].className}>{TUTORIAL_STATUS[t.status].label}</Badge>
          </div>
          <p className="whitespace-pre-wrap text-muted-foreground">{t.prompt}</p>
          {t.demanda && (
            <Link to={`/demandas/${t.demanda.id}`} className="text-[13px] text-muted-foreground hover:text-foreground">
              Demanda #{t.demanda.id}
            </Link>
          )}
        </div>

        {working && (
          <div className="flex items-center gap-2.5 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t.status === 'planning' ? 'O agente está vendo quais prints precisa…' : 'O agente está montando o tutorial…'}
          </div>
        )}
        {t.status === 'error' && (
          <div className="flex max-w-[760px] items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
            <span className="text-destructive">{t.error}</span>
            <Button size="sm" variant="outline" disabled={busy} onClick={generate}>
              Tentar de novo
            </Button>
          </div>
        )}
        {actionError && <p className="text-[13px] text-destructive">{actionError}</p>}

        {!!t.shots.length && (
          <section className="flex max-w-[1100px] flex-col gap-4">
            <div className="flex items-end justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <h2 className="font-medium">Prints</h2>
                <p className="text-[13px] text-muted-foreground">Clique, arraste ou cole (⌘V) o print. Colar vai para o print sob o mouse ou para o primeiro vazio. Os que ficarem sem imagem saem do tutorial.</p>
              </div>
              <Button disabled={!editable || busy || !withImage || uploading !== null} onClick={generate}>
                {t.ready ? 'Montar de novo' : 'Montar tutorial'}
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {t.shots.map((s, i) => (
                <ShotCard key={i} n={i + 1} shot={s} disabled={!editable || busy} uploading={uploading === i} onFile={(f) => attach(i, f)} onRemove={() => remove(i)} onHover={(on) => (hovered.current = on ? i : hovered.current === i ? null : hovered.current)} />
              ))}
            </div>
          </section>
        )}

        {t.ready && (
          <section className="flex flex-col gap-3">
            <h2 className="font-medium">Tutorial</h2>
            <div className="flex max-w-[1100px] items-end gap-2">
              <Textarea
                placeholder="Pedir ajuste: ex.: deixe o passo 2 mais curto e explique onde fica o botão Salvar (⌘ + Enter envia)"
                className="min-h-[44px] flex-1 resize-none"
                rows={1}
                value={request}
                disabled={working}
                onChange={(e) => setRequest(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && request.trim() && !busy && !working) sendAdjust()
                }}
              />
              <Button variant="outline" disabled={!request.trim() || busy || working} onClick={sendAdjust}>
                Pedir ajuste
              </Button>
            </div>
            <iframe key={version} src={doc} title="Tutorial" className={cn('h-[75vh] w-full max-w-[1100px] rounded-xl border bg-white', working && 'opacity-50')} />
          </section>
        )}
      </div>

      <AlertDialog open={confirm === 'attach'} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anexar na demanda #{t.demanda?.id}?</AlertDialogTitle>
            <AlertDialogDescription>O tutorial vai como arquivo HTML nos anexos da demanda no OpenProject, com a sua conta. Para tirar depois, só apagando o anexo por lá.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                run(async () => {
                  await api(`/tutoriais/${t.id}/anexar`, { method: 'POST' })
                  setAttached(true)
                })
              }
            >
              Anexar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirm === 'delete'} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar este tutorial?</AlertDialogTitle>
            <AlertDialogDescription>Os prints e o texto montado somem do studio. Arquivos já baixados ou anexados na demanda continuam onde estão.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                run(async () => {
                  await api(`/tutoriais/${t.id}`, { method: 'DELETE' })
                  navigate('/tutoriais')
                })
              }
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ShotCard({ n, shot, disabled, uploading, onFile, onRemove, onHover }: { n: number; shot: TutorialShot; disabled: boolean; uploading: boolean; onFile: (f: File) => void; onRemove: () => void; onHover: (on: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <div
      className={cn('flex flex-col gap-3 rounded-xl border bg-card p-3', dragging && 'border-ring')}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onDragOver={(e) => {
        if (disabled || !e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        if (disabled) return
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) onFile(file)
      }}
    >
      <div className="flex gap-2 text-[14px]">
        <span className="font-mono text-muted-foreground">{n}.</span>
        <span>{shot.description}</span>
      </div>
      {shot.image ? (
        <div className="flex flex-col gap-2">
          <a href={imageUrl(shot.image)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[10px] border bg-background">
            <img src={imageUrl(shot.image)} alt={shot.description} className="max-h-56 w-full object-contain" />
          </a>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={disabled || uploading} onClick={() => input.current?.click()}>
              Trocar
            </Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={disabled || uploading} onClick={onRemove}>
              Remover
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => input.current?.click()}
          className="flex h-28 flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed text-[13px] text-muted-foreground hover:border-ring hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {uploading ? 'Enviando…' : 'Anexar ou colar (⌘V)'}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPTED.join(',')}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// PDF numa página só: a página do PDF ganha a altura do documento inteiro, sem quebras.
async function printSinglePage(url: string) {
  const html = await fetch(url).then((r) => {
    if (!r.ok) throw new ApiError('Não deu para carregar o tutorial')
    return r.text()
  })
  const frame = document.createElement('iframe')
  // Largura de uma folha A4 a 96 dpi; sem allow-scripts o documento não roda nada.
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals')
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:600px;border:0'
  frame.srcdoc = html
  document.body.appendChild(frame)
  await new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }))
  const doc = frame.contentDocument!
  const height = Math.ceil(doc.documentElement.scrollHeight) + 2
  const style = doc.createElement('style')
  style.textContent = `@page{size:794px ${height}px;margin:0}html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}`
  doc.head.appendChild(style)
  frame.contentWindow!.print()
  setTimeout(() => frame.remove(), 1000)
}
