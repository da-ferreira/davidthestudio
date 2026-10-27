import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { Power, RotateCw } from 'lucide-react'
import type { TerminalFont, TerminalIn, TerminalOut } from '@studio/shared'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type State = 'connecting' | 'open' | 'exited' | 'error'

const STUDIO_FONT = "'Geist Mono', ui-monospace, monospace"

// A fonte do iTerm2 vem em nome PostScript; local() acha a fonte instalada por ele. O negrito segue o mesmo padrão de nome.
let fontLoad: Promise<{ family: string; size: number; lineHeight: number } | null> | null = null
function terminalFont() {
  fontLoad ??= api<TerminalFont>('/terminal/fonte')
    .then(async (f) => {
      if (!f) return null
      const families: string[] = []
      for (const [i, name] of f.fonts.entries()) {
        const family = `studio-terminal-${i}`
        const faces = [new FontFace(family, `local("${name}")`), new FontFace(family, `local("${name.replace(/-Regular$/, '-Bold')}")`, { weight: 'bold' })]
        const loaded = await Promise.allSettled(faces.map((face) => face.load()))
        loaded.forEach((r, j) => r.status === 'fulfilled' && document.fonts.add(faces[j]))
        if (loaded[0].status === 'fulfilled') families.push(`"${family}"`)
      }
      return families.length ? { family: [...families, STUDIO_FONT].join(', '), size: f.size, lineHeight: 1 } : null
    })
    .catch(() => null)
  return fontLoad
}

// O Claude interativo de verdade, rodando no daemon. Sair da tela não fecha o processo;
// ao voltar, o daemon reenvia o que já tinha saído.
export function TerminalPanel({ query, className }: { query: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const sock = useRef<WebSocket | null>(null)
  const [state, setState] = useState<State>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const term = new Terminal({
      fontFamily: STUDIO_FONT,
      fontSize: 13,
      lineHeight: 1.15,
      cursorBlink: true,
      scrollback: 5000,
      theme: { background: '#0a0a0a', foreground: '#e5e5e5', cursor: '#e5e5e5', selectionBackground: '#404040' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(box.current!)
    fit.fit()
    setState('connecting')
    setError(null)

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws/terminal?${query}&cols=${term.cols}&rows=${term.rows}`)
    sock.current = ws
    const send = (m: TerminalIn) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m))
    ws.onmessage = (msg) => {
      const m = JSON.parse(msg.data) as TerminalOut
      if (m.type === 'ready') {
        term.reset()
        setState('open')
        term.focus()
      } else if (m.type === 'data') term.write(m.data)
      else if (m.type === 'exit') setState('exited')
      else {
        setError(m.message)
        setState('error')
      }
    }
    ws.onclose = () => setState((s) => (s === 'error' ? s : 'exited'))

    const input = term.onData((data) => send({ type: 'input', data }))
    const resized = term.onResize(({ cols, rows }) => send({ type: 'resize', cols, rows }))
    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(box.current!)
    let disposed = false
    // A fonte pode chegar depois da primeira medida; refaz com a largura certa do caractere.
    terminalFont().then(async (font) => {
      await document.fonts.ready
      if (disposed) return
      if (font) Object.assign(term.options, { fontFamily: font.family, fontSize: font.size, lineHeight: font.lineHeight })
      fit.fit()
    })

    // Com o modo de mouse ligado (o Claude liga), o xterm manda um único "rolar" por evento da roda, e o trackpad
    // fica lento. Como no iTerm2, manda um por linha de distância rolada.
    let pending = 0
    term.attachCustomWheelEventHandler((e) => {
      if (term.modes.mouseTrackingMode === 'none' || e.deltaY === 0) return true
      const rect = box.current!.getBoundingClientRect()
      const cellHeight = rect.height / term.rows
      pending += e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? e.deltaY / cellHeight : e.deltaY
      const lines = Math.trunc(pending)
      if (!lines) return false
      pending -= lines
      const col = Math.min(term.cols, Math.max(1, Math.floor(((e.clientX - rect.left) / rect.width) * term.cols) + 1))
      const row = Math.min(term.rows, Math.max(1, Math.floor((e.clientY - rect.top) / cellHeight) + 1))
      send({ type: 'input', data: `\x1b[<${lines < 0 ? 64 : 65};${col};${row}M`.repeat(Math.abs(lines)) })
      return false
    })

    return () => {
      disposed = true
      observer.disconnect()
      input.dispose()
      resized.dispose()
      ws.onclose = null
      ws.close()
      term.dispose()
    }
  }, [query, attempt])

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-2.5', className)}>
      <div className="flex min-h-7 items-center gap-2.5 text-[13px] text-muted-foreground">
        {state === 'connecting' && <span>Abrindo o Claude…</span>}
        {state === 'open' && (
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-green-500" />
            Claude Code no terminal
          </span>
        )}
        {state === 'exited' && <span>O terminal foi fechado. A sessão continua guardada.</span>}
        {state === 'error' && <span className="text-destructive">{error}</span>}
        <div className="ml-auto flex gap-2">
          {state === 'open' && (
            <Button size="sm" variant="outline" title="Fecha o Claude; dá para retomar a mesma sessão depois" onClick={() => sock.current?.send(JSON.stringify({ type: 'kill' } satisfies TerminalIn))}>
              <Power />
              Encerrar
            </Button>
          )}
          {(state === 'exited' || state === 'error') && (
            <Button size="sm" variant="outline" onClick={() => setAttempt((a) => a + 1)}>
              <RotateCw />
              Abrir de novo
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-[14px] border border-line bg-[#0a0a0a] p-2.5">
        <div ref={box} className="size-full" />
      </div>
    </div>
  )
}
