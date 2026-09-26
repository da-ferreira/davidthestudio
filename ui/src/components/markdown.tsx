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
    <a href={href} target="_blank" rel="noreferrer" className="underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-500">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-neutral-400">{children}</ul>,
  ol: ({ children }) => <ol className="flex list-decimal flex-col gap-1 pl-5 marker:text-neutral-400">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5 [&>ol]:mt-1 [&>ul]:mt-1">{children}</li>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-[#e5e5e5] pl-3 text-muted-foreground">{children}</blockquote>,
  hr: () => <hr className="border-[#efefef]" />,
  code: ({ children }) => (
    <code className="rounded-[5px] border border-[#efefef] bg-[#f7f7f7] px-[5px] py-px font-mono text-[12.5px] text-neutral-800">{children}</code>
  ),
  pre: ({ children }) => {
    const code = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children.props : {}
    const lang = /language-(\S+)/.exec(code.className ?? '')?.[1]
    return <CodeBlock lang={lang} text={String(code.children ?? '').replace(/\n$/, '')} />
  },
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-[10px] border border-[#efefef]">
      <table className="w-full text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-[#efefef] bg-[#fafafa] px-3 py-1.5 text-left font-medium">{children}</th>,
  td: ({ children }) => <td className="border-b border-[#f4f4f4] px-3 py-1.5 align-top">{children}</td>,
}

function CodeBlock({ lang, text }: { lang?: string; text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  return (
    <div className="group overflow-hidden rounded-[12px] border border-[#efefef] bg-[#fafafa]">
      <div className="flex h-8 items-center justify-between border-b border-[#efefef] pr-1.5 pl-3">
        <span className="font-mono text-[11.5px] text-muted-foreground">{lang ?? 'código'}</span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[#f0f0f0] hover:text-foreground"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[12px] leading-[1.65] text-neutral-800">{text}</pre>
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
