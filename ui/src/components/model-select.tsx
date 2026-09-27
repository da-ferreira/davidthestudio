import { useEffect, useState } from 'react'
import type { AgentKind, AgentModel } from '@studio/shared'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

// O Select do Radix não aceita valor vazio, que no Codex é o padrão da conta.
const EMPTY = '__padrao'
const lists = new Map<AgentKind, Promise<AgentModel[]>>()

function load(agent: AgentKind) {
  let p = lists.get(agent)
  if (!p) {
    p = api<AgentModel[]>(`/me/agents/${agent}/models`)
    p.catch(() => lists.delete(agent))
    lists.set(agent, p)
  }
  return p
}

// Os modelos que a conta conectada oferece; se a lista não vier, campo livre.
export function ModelSelect({ agent, value, onChange, small, className }: { agent: AgentKind; value: string; onChange: (v: string) => void; small?: boolean; className?: string }) {
  const [models, setModels] = useState<AgentModel[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setModels(null)
    setFailed(false)
    load(agent).then(
      (m) => alive && setModels(m),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [agent])

  if (failed)
    return (
      <Input
        placeholder={agent === 'codex' ? 'Padrão da conta' : 'Modelo (ex.: opus)'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('font-mono', small && 'h-8 text-[13px]', className)}
      />
    )

  // Modelo que não está na lista (ex.: escolhido antes) continua aparecendo.
  const options = models && !models.some((m) => m.id === value) ? [...models, { id: value, label: value || 'Padrão da conta' }] : models
  return (
    <Select value={value || EMPTY} onValueChange={(v) => onChange(v === EMPTY ? '' : v)} disabled={!models}>
      <SelectTrigger size={small ? 'sm' : 'default'} className={className}>
        {models ? <SelectValue /> : <span className="text-muted-foreground">Carregando modelos…</span>}
      </SelectTrigger>
      <SelectContent>
        {options?.map((m) => (
          <SelectItem key={m.id || EMPTY} value={m.id || EMPTY}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
