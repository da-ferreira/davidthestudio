import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { LigaturesAddon } from '@xterm/addon-ligatures'
import { WebglAddon } from '@xterm/addon-webgl'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { Power, RotateCw } from 'lucide-react'
import type { TerminalIn, TerminalLook, TerminalOut, TerminalTheme } from '@studio/shared'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type State = 'connecting' | 'open' | 'exited' | 'error'

const STUDIO_FONT = "'Geist Mono', ui-monospace, monospace"
const STUDIO_THEME: TerminalTheme = { background: '#0a0a0a', foreground: '#e5e5e5', cursor: '#e5e5e5', selectionBackground: '#404040' }
const darkMode = window.matchMedia('(prefers-color-scheme: dark)')

type Look = { font: { family: string; size: number; lineHeight: number } | null; theme: { light: TerminalTheme; dark: TerminalTheme } | null }

// A fonte do iTerm2 vem em nome PostScript; local() acha a fonte instalada por ele. O negrito segue o mesmo padrão de nome.
let lookLoad: Promise<Look> | null = null
function terminalLook() {
  lookLoad ??= api<TerminalLook>('/terminal/aparencia')
    .then(async (f): Promise<Look> => {
      if (!f) return { font: null, theme: null }
      const families: string[] = []
      // Com o nome de família de verdade, o addon de ligaduras acha o arquivo da fonte e usa as ligaduras dela.
      try {
        type LocalFont = { postscriptName: string; family: string }
        const query = (window as unknown as { queryLocalFonts: () => Promise<LocalFont[]> }).queryLocalFonts()
        // No navegador ela pede permissão e pode ficar esperando; no app do Mac responde na hora.
        const local = await Promise.race([query, new Promise<LocalFont[]>((resolve) => setTimeout(() => resolve([]), 1500))])
        for (const name of f.fonts) {
          const family = local.find((x) => x.postscriptName === name)?.family
          if (family && !families.includes(`"${family}"`)) families.push(`"${family}"`)
        }
      } catch {
        // Sem acesso à lista de fontes; fica o apelido via local().
      }
      for (const [i, name] of f.fonts.entries()) {
        const family = `studio-terminal-${i}`
        const faces = [new FontFace(family, `local("${name}")`), new FontFace(family, `local("${name.replace(/-Regular$/, '-Bold')}")`, { weight: 'bold' })]
        const loaded = await Promise.allSettled(faces.map((face) => face.load()))
        loaded.forEach((r, j) => r.status === 'fulfilled' && document.fonts.add(faces[j]))
        if (loaded[0].status === 'fulfilled') families.push(`"${family}"`)
      }
      return { font: families.length ? { family: [...families, STUDIO_FONT].join(', '), size: f.size, lineHeight: 1 } : null, theme: f.theme }
    })
    .catch(() => ({ font: null, theme: null }))
  return lookLoad
}

// O Claude interativo de verdade, rodando no daemon. Sair da tela não fecha o processo;
// ao voltar, o daemon reenvia o que já tinha saído.
export function TerminalPanel({ query, className }: { query: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const sock = useRef<WebSocket | null>(null)
  const [state, setState] = useState<State>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [background, setBackground] = useState(STUDIO_THEME.background)

  useEffect(() => {
    const term = new Terminal({
      fontFamily: STUDIO_FONT,
      fontSize: 13,
      lineHeight: 1.15,
      cursorBlink: true,
      scrollback: 5000,
      theme: STUDIO_THEME,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(box.current!)
    // O renderizador padrão (HTML) deixa frestas entre caracteres de bloco e afina o texto; o WebGL desenha alinhado à célula.
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      // Sem WebGL fica o renderizador padrão.
    }
    // O iTerm2 do usuário desenha ligaduras (->, =>, !=); sem acesso ao arquivo da fonte o addon usa as mais comuns.
    try {
      term.loadAddon(new LigaturesAddon())
    } catch {
      // Sem ligaduras.
    }
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
        // O tamanho pode ter mudado antes de conectar (a fonte do iTerm2 chega depois); o Claude precisa do atual.
        send({ type: 'resize', cols: term.cols, rows: term.rows })
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

    // O iTerm2 avisa o Claude que Shift+Return é outra tecla; o xterm manda só Return. ESC+Return o Claude entende como quebra de linha.
    term.attachCustomKeyEventHandler((e) => {
      if (e.key !== 'Enter' || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return true
      if (e.type === 'keydown') send({ type: 'input', data: '\x1b\r' })
      return false
    })
    const input = term.onData((data) => send({ type: 'input', data }))
    const resized = term.onResize(({ cols, rows }) => send({ type: 'resize', cols, rows }))
    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(box.current!)
    let disposed = false
    let applyTheme = () => {}
    // A fonte pode chegar depois da primeira medida; refaz com a largura certa do caractere.
    terminalLook().then(async ({ font, theme }) => {
      await document.fonts.ready
      if (disposed) return
      if (font) Object.assign(term.options, { fontFamily: font.family, fontSize: font.size, lineHeight: font.lineHeight })
      if (theme) {
        // Como o iTerm2: as cores do modo claro ou escuro, acompanhando o macOS.
        applyTheme = () => {
          term.options.theme = darkMode.matches ? theme.dark : theme.light
          setBackground(term.options.theme.background!)
        }
        applyTheme()
        darkMode.addEventListener('change', applyTheme)
      }
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
      darkMode.removeEventListener('change', applyTheme)
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
      <div className="min-h-0 flex-1 overflow-hidden rounded-[14px] border border-line p-2.5" style={{ background }}>
        <div ref={box} className="size-full" />
      </div>
    </div>
  )
}
