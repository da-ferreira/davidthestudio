import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Check, GitBranch, TriangleAlert } from 'lucide-react'
import type { AgentKind, Connections, DocStage, Ticket, WorkspaceDetail } from '@studio/shared'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Topbar } from '@/components/topbar'
import { ModelSelect } from '@/components/model-select'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export function NovoTicket() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ws, setWs] = useState<WorkspaceDetail | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [repos, setRepos] = useState<string[]>([])
  const [agent, setAgent] = useState<AgentKind>('claude')
  const [model, setModel] = useState('opus')
  const [codexModel, setCodexModel] = useState('')
  const [conn, setConn] = useState<Connections | null>(null)
  const [sdd, setSdd] = useState(true)
  const [gates, setGates] = useState<DocStage[]>(['spec', 'plan'])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<WorkspaceDetail>(`/workspaces/${id}`).then((w) => {
      setWs(w)
      const present = w.repos.filter((r) => r.present)
      if (present.length === 1) setRepos([present[0].name])
    })
  }, [id])

  useEffect(() => {
    api<Connections>('/me/connections').then(setConn)
  }, [])

  const toggle = (name: string) => setRepos((rs) => (rs.includes(name) ? rs.filter((r) => r !== name) : [...rs, name]))

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const t = await api<Ticket>(`/workspaces/${id}/tickets`, { method: 'POST', body: { title, description, repos, agent, model: agent === 'codex' ? codexModel : model, sdd, gates } })
      navigate(`/w/${id}/tickets/${t.id}`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <Topbar crumbs={[ws?.name ?? '…', 'Tickets', 'Novo']} />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-7 px-10 py-10">
          <h1 className="text-[30px] font-medium tracking-[-0.025em]">O que vamos fazer em {ws?.name ?? '…'}?</h1>
          <div className="flex w-full max-w-[760px] flex-col gap-3.5 rounded-[22px] border bg-card p-4 pb-3 shadow-[0_4px_16px_rgba(0,0,0,.06)]">
            <input
              autoFocus
              placeholder="Título do ticket"
              className="text-base font-medium outline-none placeholder:text-faint"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea
              placeholder="Descreva o que o agente deve fazer: o problema, onde mexer, como saber que ficou pronto."
              className="min-h-[110px] resize-none border-0 bg-transparent dark:bg-transparent p-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              {ws?.repos
                .filter((r) => r.present)
                .map((r) => {
                  const on = repos.includes(r.name)
                  return (
                    <button
                      key={r.name}
                      type="button"
                      onClick={() => toggle(r.name)}
                      className={cn(
                        'flex h-7 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors',
                        on ? 'border-primary bg-primary text-primary-foreground' : 'border-dashed text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {on ? <Check className="size-3" /> : <GitBranch className="size-3" />}
                      {r.name}
                    </button>
                  )
                })}
              <span className="text-[13px] text-muted-foreground">
                {repos.length
                  ? 'uma worktree por repositório escolhido'
                  : sdd
                    ? 'nenhum escolhido: o agente decide na spec'
                    : 'escolha os repositórios afetados'}
              </span>
            </div>
          </div>
        </div>
        <aside className="flex w-[340px] shrink-0 flex-col gap-6 border-l border-sidebar-border px-6 py-6">
          <div className="flex flex-col gap-2">
            <Label>Agente</Label>
            <Select value={agent} onValueChange={(v) => setAgent(v as AgentKind)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude">Claude Code</SelectItem>
                <SelectItem value="codex">Codex</SelectItem>
              </SelectContent>
            </Select>
            {conn && !conn[agent].connected && (
              <span className="text-[13px] text-destructive">
                O {agent === 'codex' ? 'Codex' : 'Claude Code'} não está conectado.{' '}
                <Link to="/conexoes" className="underline">
                  Conectar
                </Link>
              </span>
            )}
            {agent === 'codex' && (
              <div className="flex items-start gap-2.5 rounded-[10px] bg-warning-soft px-3 py-2.5 text-[13px] text-amber-900 dark:text-amber-200">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  O Codex não pede permissão: roda sozinho numa sandbox que só grava na pasta da tarefa, com internet e sem acesso aos .env. Dúvidas
                  vão para a spec.
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label>Modelo</Label>
            {agent === 'codex' ? (
              <ModelSelect key="codex" agent="codex" value={codexModel} onChange={setCodexModel} className="w-full" />
            ) : (
              <ModelSelect key="claude" agent="claude" value={model} onChange={setModel} className="w-full" />
            )}
          </div>
          <div className="flex flex-col gap-3">
            <Label>Etapas</Label>
            <label className="flex items-start justify-between gap-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-[14px]">Spec e plano antes de codar</span>
                <span className="text-[13px] text-muted-foreground">
                  {sdd ? 'O agente escreve a spec e o plano antes de mexer no código.' : 'Ticket rápido: o agente começa direto na implementação.'}
                </span>
              </span>
              <Switch checked={sdd} onCheckedChange={setSdd} />
            </label>
            {sdd && (
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-muted-foreground">Parar para eu aprovar</span>
                <div className="flex gap-5">
                  {(['spec', 'plan'] as const).map((st) => (
                    <label key={st} className="flex items-center gap-2 text-[14px]">
                      <Checkbox
                        checked={gates.includes(st)}
                        onCheckedChange={(on) => setGates((g) => (on ? [...g, st] : g.filter((x) => x !== st)))}
                      />
                      {st === 'spec' ? 'Spec' : 'Plano'}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          {error && <p className="text-[13px] text-destructive">{error}</p>}
          <div className="mt-auto flex gap-2">
            <Button variant="outline" size="lg" className="flex-1" onClick={() => navigate(`/w/${id}/tickets`)}>
              Cancelar
            </Button>
            <Button size="lg" className="flex-[2]" disabled={!title.trim() || (!repos.length && !sdd) || busy || (!!conn && !conn[agent].connected)} onClick={submit}>
              {busy ? 'Criando worktrees…' : 'Criar e iniciar'}
            </Button>
          </div>
        </aside>
      </div>
    </>
  )
}
