import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Gauge } from 'lucide-react'
import type { ProviderUsage, Usage, UsageSpend } from '@studio/shared'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type Level = 'ok' | 'warn' | 'danger'

function level(pct: number): Level {
  return pct >= 95 ? 'danger' : pct >= 80 ? 'warn' : 'ok'
}

const barColor: Record<Level, string> = { ok: 'bg-success', warn: 'bg-warning', danger: 'bg-danger' }
const textColor: Record<Level, string> = { ok: 'text-success', warn: 'text-warning', danger: 'text-danger' }

// Pior janela do provedor; null quando não há limite para mostrar.
const peak = (p: ProviderUsage) => (p.state === 'ok' && p.windows.length ? Math.max(0, ...p.windows.map((w) => w.utilization)) : null)

// Guarda a última leitura para o header não piscar vazio a cada troca de tela.
let cached: Usage | null = null

const time = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function resetLabel(iso: string, now = new Date()) {
  const d = new Date(iso)
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(d) - day(now)) / 86_400_000)
  if (diff <= 0) return `Redefine às ${time(d)}`
  if (diff === 1) return `Redefine amanhã às ${time(d)}`
  const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `Redefine em ${weekday}, ${date} às ${time(d)}`
}

const names = { claude: 'Claude', codex: 'Codex' }

export function UsageButton() {
  const [open, setOpen] = useState(false)
  const [usage, setUsage] = useState<Usage | null>(cached)

  const load = () =>
    api<Usage>('/me/usage')
      .then((u) => {
        cached = u
        setUsage(u)
      })
      .catch(() => {})

  useEffect(() => {
    load()
  }, [])

  const meters = usage ? (['claude', 'codex'] as const).flatMap((a) => (peak(usage[a]) === null ? [] : [{ agent: a, pct: peak(usage[a])! }])) : []

  return (
    <>
      <button
        type="button"
        aria-label="Consumo dos provedores"
        title="Consumo dos provedores"
        onClick={() => {
          setOpen(true)
          load()
        }}
        className="flex h-8 items-center gap-2.5 rounded-full border bg-background px-3 text-[13px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Gauge className="size-3.5" />
        {meters.length === 0 && <span>Uso</span>}
        {meters.map((m, i) => (
          <span key={m.agent} className="flex items-center gap-1.5">
            {i > 0 && <span className="mr-1 h-3.5 w-px bg-border" />}
            <span>{names[m.agent]}</span>
            <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
              <span className={cn('block h-full rounded-full', barColor[level(m.pct)])} style={{ width: `${Math.min(100, Math.max(3, m.pct))}%` }} />
            </span>
            <span className={cn('font-medium tabular-nums', level(m.pct) === 'ok' ? 'text-foreground' : textColor[level(m.pct)])}>{Math.round(m.pct)}%</span>
          </span>
        ))}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined} className="gap-5 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Consumo</DialogTitle>
          </DialogHeader>
          {(['claude', 'codex'] as const).map((a) => (
            <Provider key={a} name={names[a]} usage={usage?.[a] ?? null} onNavigate={() => setOpen(false)} />
          ))}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Provider({ name, usage, onNavigate }: { name: string; usage: ProviderUsage | null; onNavigate: () => void }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="font-medium">{name}</span>
        {usage?.account && <span className="truncate text-[13px] text-muted-foreground">{usage.account}</span>}
      </div>
      {!usage ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : (
        <>
          {usage.state === 'ok' &&
            usage.windows.map((w) => (
              <div key={w.key} className="flex flex-col gap-1.5">
                <div className="flex items-end justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[14px]">{w.label}</span>
                    {w.resetsAt && <span className="text-[12px] text-muted-foreground">{resetLabel(w.resetsAt)}</span>}
                  </div>
                  <span className={cn('shrink-0 text-[13px] font-medium tabular-nums', textColor[level(w.utilization)])}>{Math.round(w.utilization)}% usado</span>
                </div>
                <Progress value={Math.min(100, Math.max(0, w.utilization))} indicatorClassName={barColor[level(w.utilization)]} />
              </div>
            ))}
          {usage.state === 'ok' && !usage.windows.length && <Note>O provedor não informou limites para esta conta.</Note>}
          {usage.state === 'disconnected' && (
            <Note>
              Não conectado.{' '}
              <Link to="/conexoes" onClick={onNavigate} className="text-foreground underline underline-offset-2">
                Conectar
              </Link>
            </Note>
          )}
          {usage.state === 'apikey' && <Note>Chave de API: sem limite de assinatura</Note>}
          {usage.state === 'error' && <Note>Não foi possível ler os limites agora</Note>}
          <Spend spend={usage.spend} />
        </>
      )}
    </section>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] text-muted-foreground">{children}</p>
}

function Spend({ spend }: { spend: UsageSpend }) {
  const fmt = (n: number | null) => {
    if (n === null) return '—'
    if (spend.unit === 'usd') return `US$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return `${n.toLocaleString('pt-BR')} tokens`
  }
  return (
    <p className="text-[13px] text-muted-foreground">
      No studio · Hoje: {fmt(spend.today)} · 7 dias: {fmt(spend.week)}
    </p>
  )
}
