import { useRef, useState, type ComponentProps, type KeyboardEvent } from 'react'
import type { DemandaPerson } from '@studio/shared'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

type Props = Omit<ComponentProps<typeof Textarea>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
  // null: ainda não carregou; a lista só é buscada no primeiro @.
  people: DemandaPerson[] | null
  onNeedPeople: () => void
  onMention: (person: DemandaPerson) => void
}

// Campo de comentário com @: a lista aparece embaixo, filtrada pelo que vem depois do @.
export function MentionTextarea({ value, onValueChange, people, onNeedPeople, onMention, onKeyDown, className, ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [mention, setMention] = useState<{ start: number; end: number; query: string } | null>(null)
  const [active, setActive] = useState(0)
  const asked = useRef(false)

  const matches = mention && people ? people.filter((p) => fold(p.name).includes(fold(mention.query))).slice(0, 8) : []

  const detect = (text: string, caret: number) => {
    const m = text.slice(0, caret).match(/(?:^|\s)@([^\s@]*)$/)
    if (!m) return setMention(null)
    if (!people && !asked.current) {
      asked.current = true
      onNeedPeople()
    }
    setMention({ start: caret - m[1].length - 1, end: caret, query: m[1] })
    setActive(0)
  }

  const pick = (p: DemandaPerson) => {
    if (!mention) return
    const insert = `@${p.name} `
    onValueChange(value.slice(0, mention.start) + insert + value.slice(mention.end))
    onMention(p)
    setMention(null)
    const caret = mention.start + insert.length
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(caret, caret)
    })
  }

  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && matches.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length)
        return
      }
      if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
        e.preventDefault()
        pick(matches[active])
        return
      }
    }
    if (mention && e.key === 'Escape') {
      e.preventDefault()
      setMention(null)
      return
    }
    onKeyDown?.(e)
  }

  return (
    <div className="relative">
      <Textarea
        {...props}
        ref={ref}
        value={value}
        className={className}
        onChange={(e) => {
          onValueChange(e.target.value)
          detect(e.target.value, e.target.selectionStart)
        }}
        onKeyDown={keyDown}
        onBlur={() => setMention(null)}
      />
      {mention && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-[10px] border border-line bg-background p-1 text-[13px] shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
          {!people && <div className="px-2.5 py-1.5 text-muted-foreground">Carregando pessoas…</div>}
          {people && !matches.length && <div className="px-2.5 py-1.5 text-muted-foreground">Ninguém com esse nome no projeto</div>}
          {matches.map((p, i) => (
            <button
              key={p.id}
              type="button"
              // mousedown, não click: o blur do campo fecharia a lista antes do clique.
              onMouseDown={(e) => {
                e.preventDefault()
                pick(p)
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex w-full items-center justify-between gap-2 rounded-[7px] px-2.5 py-1.5 text-left', i === active && 'bg-muted')}
            >
              <span className="truncate">{p.name}</span>
              {p.type === 'group' && <span className="shrink-0 text-[12px] text-muted-foreground">grupo</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
