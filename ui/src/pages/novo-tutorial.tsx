import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { DemandaDetail, Tutorial } from '@studio/shared'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Topbar } from '@/components/topbar'
import { ModelSelect } from '@/components/model-select'
import { ApiError, api } from '@/lib/api'

export function NovoTutorial() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const demandaId = params.get('demanda')
  const [demanda, setDemanda] = useState<DemandaDetail | null>(null)
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('opus')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!demandaId) return
    api<DemandaDetail>(`/demandas/${demandaId}`)
      .then((d) => {
        setDemanda(d)
        setTitle((t) => t || d.subject)
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Não deu para carregar a demanda'))
  }, [demandaId])

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const t = await api<Tutorial>('/tutoriais', { method: 'POST', body: { title, prompt, model, ...(demandaId && { demanda: demandaId }) } })
      navigate(`/tutoriais/${t.id}`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Falhou')
      setBusy(false)
    }
  }

  return (
    <>
      <Topbar crumbs={['Tutoriais', 'Novo']} />
      <div className="flex flex-1 flex-col items-center px-8 py-10">
        <div className="flex w-full max-w-[760px] flex-col gap-5">
          <div className="flex flex-col gap-3.5 rounded-[22px] border bg-card p-4 shadow-[0_4px_16px_rgba(0,0,0,.06)]">
            <input
              autoFocus
              placeholder="Título do tutorial"
              className="bg-transparent text-base font-medium outline-none placeholder:text-faint"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea
              placeholder="O que o tutorial deve ensinar, para quem e até onde. Ex.: como um atendente cadastra um número de teste no painel, do login até ver o número ativo."
              className="min-h-[140px] resize-none border-0 bg-transparent dark:bg-transparent p-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && prompt.trim() && !busy) submit()
              }}
            />
          </div>
          {demandaId && (
            <p className="text-[13px] text-muted-foreground">
              O texto da{' '}
              <Link to={`/demandas/${demandaId}`} className="text-foreground hover:underline">
                demanda #{demandaId}
              </Link>
              {demanda ? ` (${demanda.subject})` : ''} vai junto como contexto para o agente.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Modelo</Label>
            <ModelSelect agent="claude" value={model} onChange={setModel} className="w-64" />
          </div>
          <p className="text-[13px] text-muted-foreground">Primeiro o agente diz quais prints de tela precisa. Você anexa cada um e ele monta o tutorial.</p>
          {error && <p className="text-[13px] text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button disabled={!prompt.trim() || busy} onClick={submit}>
              {busy ? 'Criando…' : 'Criar tutorial'}
            </Button>
            <Button variant="outline" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
