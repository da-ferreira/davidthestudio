import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { ImagePlus, LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ACCEPTED, MAX_IMAGES, checkFile, imageUrl, uploadImage } from '@/lib/images'
import { cn } from '@/lib/utils'

type Item = { key: string; url: string; id?: string }

export type Attachments = ReturnType<typeof useImageAttachments>

// Imagens anexadas a uma caixa de texto: cada uma sobe ao ser anexada e a mensagem leva só os ids.
export function useImageAttachments() {
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const current = useRef(items)
  current.current = items

  useEffect(() => () => current.current.forEach((i) => URL.revokeObjectURL(i.url)), [])

  function add(files: File[]) {
    setError(null)
    const room = MAX_IMAGES - current.current.length
    const valid: File[] = []
    for (const f of files) {
      const problem = checkFile(f)
      if (problem) setError(problem)
      else valid.push(f)
    }
    if (valid.length > room) setError(`Dá para anexar até ${MAX_IMAGES} imagens por mensagem`)
    const added = valid.slice(0, Math.max(room, 0)).map((file) => ({ file, item: { key: crypto.randomUUID(), url: URL.createObjectURL(file) } }))
    if (!added.length) return
    setItems((is) => [...is, ...added.map((a) => a.item)])
    for (const { file, item } of added) {
      uploadImage(file).then(
        (id) => setItems((is) => is.map((i) => (i.key === item.key ? { ...i, id } : i))),
        (err) => {
          setError((err as Error).message)
          remove(item.key)
        },
      )
    }
  }

  function remove(key: string) {
    const item = current.current.find((i) => i.key === key)
    if (item) URL.revokeObjectURL(item.url)
    setItems((is) => is.filter((i) => i.key !== key))
  }

  function clear() {
    current.current.forEach((i) => URL.revokeObjectURL(i.url))
    setItems([])
    setError(null)
  }

  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files')

  return {
    items,
    ids: items.flatMap((i) => (i.id ? [i.id] : [])),
    uploading: items.some((i) => !i.id),
    error,
    dragging,
    add,
    remove,
    clear,
    // Colar texto segue normal; só intercepta quando a área de transferência traz arquivo.
    onPaste(e: ClipboardEvent) {
      const files = [...e.clipboardData.files]
      if (!files.length) return
      e.preventDefault()
      add(files)
    },
    dropProps: {
      onDragOver(e: DragEvent) {
        if (!hasFiles(e)) return
        e.preventDefault()
        setDragging(true)
      },
      onDragLeave(e: DragEvent) {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      },
      onDrop(e: DragEvent) {
        if (!hasFiles(e)) return
        e.preventDefault()
        setDragging(false)
        add([...e.dataTransfer.files])
      },
    },
  }
}

export function AttachButton({ attachments, disabled }: { attachments: Attachments; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="rounded-full text-muted-foreground"
        disabled={disabled}
        onClick={() => input.current?.click()}
        aria-label="Anexar imagem"
        title="Anexar imagem (ou cole/arraste na caixa)"
      >
        <ImagePlus />
      </Button>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED.join(',')}
        multiple
        hidden
        onChange={(e) => {
          attachments.add([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </>
  )
}

// Miniaturas antes de enviar, com o "x" para tirar.
export function AttachmentPreview({ attachments }: { attachments: Attachments }) {
  if (!attachments.items.length && !attachments.error) return null
  return (
    <div className="flex flex-col gap-1.5">
      {!!attachments.items.length && (
        <div className="flex flex-wrap gap-2">
          {attachments.items.map((i) => (
            <div key={i.key} className="group relative size-16 overflow-hidden rounded-[10px] border">
              <img src={i.url} alt="" className={cn('size-full object-cover', !i.id && 'opacity-50')} />
              {!i.id && <LoaderCircle className="absolute inset-0 m-auto size-4 animate-spin text-muted-foreground" />}
              <button
                type="button"
                onClick={() => attachments.remove(i.key)}
                className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-80 hover:opacity-100"
                aria-label="Remover imagem"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {attachments.error && <span className="text-[13px] text-destructive">{attachments.error}</span>}
    </div>
  )
}

// Imagens de uma mensagem já enviada; clicar abre a imagem inteira.
export function UserImages({ ids }: { ids?: string[] }) {
  if (!ids?.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <a key={id} href={imageUrl(id)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[10px] border bg-background">
          <img src={imageUrl(id)} alt="Imagem anexada" loading="lazy" className="max-h-40 max-w-[240px] object-contain" />
        </a>
      ))}
    </div>
  )
}
