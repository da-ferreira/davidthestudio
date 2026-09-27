import { isValidElement, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

const components: Components = {
  h1: ({ children }) => <h3 className="text-[16px] font-semibold tracking-[-0.01em]">{children}</h3>,
  h2: ({ children }) => <h4 className="text-[15px] font-semibold tracking-[-0.01em]">{children}</h4>,
  h3: ({ children }) => <h5 className="font-semibold">{children}</h5>,
  h4: ({ children }) => <h6 className="font-medium">{children}</h6>,
  p: ({ children }) => <p>{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:decoration-muted-foreground">
      {children}
    </a>
  ),
  // remark-gfm marca checklists (- [ ]) com essas classes; sem bolinha, só a caixa.
  ul: ({ className, children }) => (
    <ul className={cn('flex flex-col gap-1', className === 'contains-task-list' ? 'pl-0.5' : 'list-disc pl-5 marker:text-faint')}>{children}</ul>
  ),
  ol: ({ children }) => <ol className="flex list-decimal flex-col gap-1 pl-5 marker:text-faint">{children}</ol>,
  li: ({ className, children }) => (
    <li className={cn('pl-0.5 [&>ol]:mt-1 [&>ul]:mt-1', className === 'task-list-item' && 'list-none')}>{children}</li>
  ),
  input: ({ checked }) => (
    <span
      className={cn(
        'mr-2 inline-flex size-[15px] translate-y-[2px] items-center justify-center rounded-[4px] border',
        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-line-strong',
      )}
    >
      {checked && <Check className="size-2.5" strokeWidth={3} />}
    </span>
  ),
  blockquote: ({ children }) => <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>,
  hr: () => <hr className="border-line" />,
  code: ({ children }) => (
    <code className="rounded-[5px] border border-line bg-surface-2 px-[5px] py-px font-mono text-[12.5px] text-body">{children}</code>
  ),
  pre: ({ children }) => {
    const code = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children.props : {}
    const lang = /language-(\S+)/.exec(code.className ?? '')?.[1]
    return <CodeBlock lang={lang} text={String(code.children ?? '').replace(/\n$/, '')} />
  },
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-[10px] border border-line">
      <table className="w-full text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-line bg-surface px-3 py-1.5 text-left font-medium">{children}</th>,
  td: ({ children }) => <td className="border-b border-line px-3 py-1.5 align-top">{children}</td>,
}

function CodeBlock({ lang, text }: { lang?: string; text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  return (
    <div className="group overflow-hidden rounded-[12px] border border-line bg-surface">
      <div className="flex h-8 items-center justify-between border-b border-line pr-1.5 pl-3">
        <span className="font-mono text-[11.5px] text-muted-foreground">{lang ?? 'código'}</span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[12px] leading-[1.65] text-body">{text}</pre>
    </div>
  )
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2.5 leading-relaxed break-words', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
