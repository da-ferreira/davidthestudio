import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { AgentKind, AgentStatus, Connections } from '@studio/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Topbar } from '@/components/topbar'
import { ApiError, api } from '@/lib/api'

const NAME: Record<AgentKind, string> = { claude: 'Claude Code', codex: 'Codex' }
const METHOD = { subscription: 'assinatura', apikey: 'chave de API' }

function useAct(load: () => Promise<unknown>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Falhou')
    }
    await load()
    setBusy(false)
  }
  return { busy, error, act }
}

function Section({ title, badge, action, children }: { title: string; badge: ReactNode; action?: ReactNode; children?: ReactNode }) {
  return (
    <section className="flex max-w-[720px] flex-col gap-4 rounded-[14px] border border-[#efefef] px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="font-medium">{title}</span>
        {badge}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  )
}

const Connected = ({ text }: { text: string }) => <Badge className="bg-green-50 text-green-700">{text}</Badge>
const Disconnected = () => <Badge className="bg-neutral-100 text-neutral-600">Não conectado</Badge>
const ErrorText = ({ text }: { text: string | null }) => text && <span className="text-[13px] text-destructive">{text}</span>

function SecretForm({ hint, placeholder, button, busy, onSave }: { hint: string; placeholder: string; button: string; busy: boolean; onSave: (v: string) => Promise<unknown> }) {
  const [value, setValue] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSave(value).then(() => setValue(''))
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <span className="text-[13px] text-muted-foreground">{hint}</span>
      <div className="flex gap-2">
        <Input type="password" autoComplete="off" placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} className="font-mono" />
        <Button type="submit" size="sm" variant="outline" className="h-9" disabled={busy || !value.trim()}>
          {button}
        </Button>
      </div>
    </form>
  )
}

function AgentCard({ agent, status, load }: { agent: AgentKind; status: AgentStatus; load: () => Promise<unknown> }) {
  const { busy, error, act } = useAct(load)
  const [code, setCode] = useState('')
  const base = `/me/agents/${agent}`
  const login = status.login
  const machineLogout = status.machine && status.method === 'subscription'

  const sendCode = (e: FormEvent) => {
    e.preventDefault()
    act(() => api(`${base}/code`, { method: 'POST', body: { code } }).then(() => setCode('')))
  }

  return (
    <Section
      title={NAME[agent]}
      badge={status.connected ? <Connected text={`Conectado · ${[status.method && METHOD[status.method], status.account].filter(Boolean).join(' · ')}`} /> : <Disconnected />}
      action={
        status.connected && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => api(`${base}/logout`, { method: 'POST' }))}>
            Sair
          </Button>
        )
      }
    >
      {machineLogout && <span className="text-[13px] text-muted-foreground">Você usa o login do {NAME[agent]} desta máquina; sair desconecta ele aqui também.</span>}
      {!status.connected && (
        <>
          {login ? (
            <div className="flex flex-col gap-3">
              <span className="text-[13px] text-muted-foreground">
                1.{' '}
                <a href={login.url} target="_blank" rel="noreferrer" className="text-foreground underline">
                  Abra o login
                </a>{' '}
                e entre na sua conta{agent === 'codex' ? '.' : ' do Claude.'}
              </span>
              {agent === 'codex' ? (
                <span className="text-[13px] text-muted-foreground">
                  2. Digite este código lá: <span className="font-mono text-[15px] text-foreground">{login.code}</span>. Esta tela atualiza sozinha.
                </span>
              ) : (
                <form onSubmit={sendCode} className="flex flex-col gap-2">
                  <span className="text-[13px] text-muted-foreground">2. Cole aqui o código que aparece no final.</span>
                  <div className="flex gap-2">
                    <Input autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} className="font-mono" />
                    <Button type="submit" size="sm" className="h-9" disabled={busy || !code.trim()}>
                      Conectar
                    </Button>
                  </div>
                </form>
              )}
              <Button size="sm" variant="ghost" className="self-start text-muted-foreground" disabled={busy} onClick={() => act(() => api(`${base}/login/cancel`, { method: 'POST' }))}>
                Cancelar login
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Button size="sm" disabled={busy} onClick={() => act(() => api(`${base}/login`, { method: 'POST' }))}>
                Entrar com {agent === 'codex' ? 'ChatGPT' : 'Claude'}
              </Button>
              <span className="text-[13px] text-muted-foreground">Usa a sua assinatura.</span>
            </div>
          )}
          <div className="border-t border-[#efefef] pt-4">
            <SecretForm
              hint={agent === 'codex' ? 'Ou use uma chave de API da OpenAI.' : 'Ou use uma chave de API da Anthropic.'}
              placeholder={agent === 'codex' ? 'sk-…' : 'sk-ant-…'}
              button="Salvar chave"
              busy={busy}
              onSave={(key) => act(() => api(`${base}/api-key`, { method: 'POST', body: { key } }))}
            />
          </div>
        </>
      )}
      <ErrorText text={error} />
    </Section>
  )
}

function GithubCard({ status, load }: { status: Connections['github']; load: () => Promise<unknown> }) {
  const { busy, error, act } = useAct(load)
  return (
    <Section
      title="GitHub"
      badge={status.connected ? <Connected text={status.account ? `Conectado · ${status.account}` : 'Conectado · login desta máquina'} /> : <Disconnected />}
      action={
        status.account && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => api('/me/github', { method: 'DELETE' }))}>
            Remover token
          </Button>
        )
      }
    >
      <span className="text-[13px] text-muted-foreground">Clonar repositórios, subir branches e abrir PRs usam a sua conta.</span>
      {!status.account && (
        <SecretForm
          hint={
            status.machine
              ? 'Para usar outra conta em vez da desta máquina, cole um token com acesso aos repositórios (escopo repo).'
              : 'Cole um token pessoal com acesso aos repositórios (escopo repo).'
          }
          placeholder="ghp_… ou github_pat_…"
          button="Salvar token"
          busy={busy}
          onSave={(token) => act(() => api('/me/github', { method: 'PUT', body: { token } }))}
        />
      )}
      <ErrorText text={error} />
    </Section>
  )
}

export function Conexoes() {
  const [c, setC] = useState<Connections | null>(null)
  const load = () => api<Connections>('/me/connections').then(setC)
  useEffect(() => {
    load()
  }, [])

  // O login termina em outra aba; acompanha até o agente confirmar.
  const waiting = !!(c?.claude.login || c?.codex.login)
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(load, 2000)
    return () => clearInterval(timer)
  }, [waiting])

  return (
    <>
      <Topbar crumbs={['Conexões']} />
      <div className="flex flex-1 flex-col gap-6 px-8 py-7">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-medium tracking-[-0.025em]">Conexões</h1>
          <span className="text-muted-foreground">Os seus tickets rodam com os agentes conectados aqui.</span>
        </div>
        {c && (
          <>
            <AgentCard agent="claude" status={c.claude} load={load} />
            <AgentCard agent="codex" status={c.codex} load={load} />
            <GithubCard status={c.github} load={load} />
          </>
        )}
      </div>
    </>
  )
}
