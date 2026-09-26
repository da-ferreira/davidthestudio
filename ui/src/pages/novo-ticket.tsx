import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Check, GitBranch } from 'lucide-react'
import type { Ticket, WorkspaceDetail } from '@studio/shared'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Topbar } from '@/components/topbar'
import { MODELS } from '@/components/ticket-status'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export function NovoTicket() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ws, setWs] = useState<WorkspaceDetail | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [repos, setRepos] = useState<string[]>([])
  const [model, setModel] = useState('opus')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<WorkspaceDetail>(`/workspaces/${id}`).then((w) => {
      setWs(w)
      const present = w.repos.filter((r) => r.present)
      if (present.length === 1) setRepos([present[0].name])
    })
  }, [id])

  const toggle = (name: string) => setRepos((rs) => (rs.includes(name) ? rs.filter((r) => r !== name) : [...rs, name]))

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const t = await api<Ticket>(`/workspaces/${id}/tickets`, { method: 'POST', body: { title, description, repos, model } })
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
          <div className="flex w-full max-w-[760px] flex-col gap-3.5 rounded-[22px] border bg-white p-4 pb-3 shadow-[0_4px_16px_rgba(0,0,0,.06)]">
            <input
              autoFocus
              placeholder="Título do ticket"
              className="text-base font-medium outline-none placeholder:text-neutral-400"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea
              placeholder="Descreva o que o agente deve fazer: o problema, onde mexer, como saber que ficou pronto."
              className="min-h-[110px] resize-none border-0 bg-transparent p-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
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
                        on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-dashed text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {on ? <Check className="size-3" /> : <GitBranch className="size-3" />}
                      {r.name}
                    </button>
                  )
                })}
              <span className="text-[13px] text-muted-foreground">
                {repos.length ? 'uma worktree por repositório escolhido' : 'escolha os repositórios afetados'}
              </span>
            </div>
          </div>
        </div>
        <aside className="flex w-[340px] shrink-0 flex-col gap-6 border-l border-sidebar-border px-6 py-6">
          <div className="flex flex-col gap-2">
            <Label>Agente</Label>
            <div className="flex h-9 items-center rounded-lg border px-3 text-muted-foreground">Claude Code</div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Modelo</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-[13px] text-destructive">{error}</p>}
          <div className="mt-auto flex gap-2">
            <Button variant="outline" size="lg" className="flex-1" onClick={() => navigate(`/w/${id}/tickets`)}>
              Cancelar
            </Button>
            <Button size="lg" className="flex-[2]" disabled={!title.trim() || !repos.length || busy} onClick={submit}>
              {busy ? 'Criando worktrees…' : 'Criar e iniciar'}
            </Button>
          </div>
        </aside>
      </div>
    </>
  )
}
