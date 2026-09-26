import { useEffect, useState, type FormEvent } from 'react'
import type { CodexStatus } from '@studio/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Topbar } from '@/components/topbar'
import { ApiError, api } from '@/lib/api'

const METHOD = { chatgpt: 'conta ChatGPT', apikey: 'chave de API' }

export function Agentes() {
  const [codex, setCodex] = useState<CodexStatus | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = () => api<CodexStatus>('/codex').then(setCodex)
  useEffect(() => {
    load()
  }, [])

  // O login pelo navegador termina fora da tela; acompanha até o Codex confirmar.
  useEffect(() => {
    if (!codex?.loggingIn) return
    const timer = setInterval(load, 2000)
    return () => clearInterval(timer)
  }, [codex?.loggingIn])
  useEffect(() => {
    if (codex && !codex.loggingIn) setUrl(null)
  }, [codex])

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

  const loginChatGpt = () => act(() => api<{ url: string }>('/codex/login', { method: 'POST' }).then((r) => setUrl(r.url)))

  const saveKey = (e: FormEvent) => {
    e.preventDefault()
    act(() => api('/codex/api-key', { method: 'POST', body: { key } }).then(() => setKey('')))
  }

  return (
    <>
      <Topbar crumbs={['Agentes']} />
      <div className="flex flex-1 flex-col gap-6 px-8 py-7">
        <h1 className="text-[28px] font-medium tracking-[-0.025em]">Agentes</h1>
        <section className="flex max-w-[720px] items-center gap-3 rounded-[14px] border border-[#efefef] px-5 py-4">
          <span className="font-medium">Claude Code</span>
          <span className="text-[13px] text-muted-foreground">usa o login do Claude Code desta máquina</span>
        </section>
        <section className="flex max-w-[720px] flex-col gap-4 rounded-[14px] border border-[#efefef] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="font-medium">Codex</span>
            {codex &&
              (codex.connected ? (
                <Badge className="bg-green-50 text-green-700">Conectado{codex.method && ` · ${METHOD[codex.method]}`}</Badge>
              ) : (
                <Badge className="bg-neutral-100 text-neutral-600">Não conectado</Badge>
              ))}
            {codex?.connected && (
              <Button size="sm" variant="outline" className="ml-auto" disabled={busy} onClick={() => act(() => api('/codex/logout', { method: 'POST' }))}>
                Sair
              </Button>
            )}
          </div>
          {codex && !codex.connected && (
            <>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  {codex.loggingIn ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => api('/codex/login/cancel', { method: 'POST' }))}>
                      Cancelar login
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busy} onClick={loginChatGpt}>
                      Entrar com ChatGPT
                    </Button>
                  )}
                  <span className="text-[13px] text-muted-foreground">
                    {codex.loggingIn ? 'Termine o login no navegador; esta tela atualiza sozinha.' : 'Abre o navegador para você entrar na sua conta.'}
                  </span>
                </div>
                {url && (
                  <span className="text-[13px] text-muted-foreground">
                    Se o navegador não abriu,{' '}
                    <a href={url} target="_blank" rel="noreferrer" className="text-foreground underline">
                      abra o login por aqui
                    </a>
                    .
                  </span>
                )}
              </div>
              <form onSubmit={saveKey} className="flex flex-col gap-2 border-t border-[#efefef] pt-4">
                <span className="text-[13px] text-muted-foreground">Ou use uma chave de API da OpenAI. Ela vai direto para o Codex; o studio não guarda.</span>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="sk-…"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    className="font-mono"
                  />
                  <Button type="submit" size="sm" variant="outline" className="h-9" disabled={busy || !key.trim()}>
                    Salvar chave
                  </Button>
                </div>
              </form>
            </>
          )}
          {error && <span className="text-[13px] text-destructive">{error}</span>}
        </section>
      </div>
    </>
  )
}
