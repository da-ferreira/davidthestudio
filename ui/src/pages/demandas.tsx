import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Search, X } from 'lucide-react'
import type { DemandaPage, DemandaQuery, DemandasMeta } from '@studio/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Topbar } from '@/components/topbar'
import { timeAgo } from '@/components/notifications'
import { DemandaStatusBadge, DueDate, isDueDateSettled, Priority } from '@/components/demanda-badges'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/utils'

// Radix Select não aceita valor vazio.
const ALL = '_todos'

const ESCOPOS: { id: NonNullable<DemandaQuery['escopo']>; label: string }[] = [
  { id: 'atribuidas', label: 'Atribuídas a mim' },
  { id: 'responsavel', label: 'Sou responsável' },
  { id: 'observando', label: 'Observando' },
  { id: 'criadas', label: 'Criadas por mim' },
  { id: 'todas', label: 'Todas que vejo' },
]

const PRAZOS: { id: NonNullable<DemandaQuery['prazo']>; label: string }[] = [
  { id: 'atrasadas', label: 'Atrasadas' },
  { id: 'hoje', label: 'Vencem hoje' },
  { id: 'semana', label: 'Vencem nesta semana' },
  { id: 'sem', label: 'Sem prazo' },
]

const ORDENS: { id: NonNullable<DemandaQuery['ordem']>; label: string }[] = [
  { id: 'atualizacao', label: 'Atualizadas recentemente' },
  { id: 'prazo', label: 'Prazo mais próximo' },
  { id: 'prioridade', label: 'Maior prioridade' },
  { id: 'criacao', label: 'Criadas recentemente' },
  { id: 'id', label: 'Número' },
]

const FILTER_KEYS = ['escopo', 'situacao', 'status', 'projeto', 'tipo', 'prioridade', 'prazo', 'q', 'ordem'] as const

// Filtro em uso fica destacado para não esquecer que a lista está recortada.
function FilterSelect({ value, onChange, all, options, active }: { value: string; onChange: (v: string) => void; all?: string; options: { id: string; label: string }[]; active?: boolean }) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
      <SelectTrigger size="sm" className={cn('w-auto max-w-[240px] gap-1.5', (active ?? !!value) && 'border-foreground/25 bg-surface-2 font-medium')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {all && <SelectItem value={ALL}>{all}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function Demandas() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [meta, setMeta] = useState<DemandasMeta | null>(null)
  const [page, setPage] = useState<DemandaPage | null>(null)
  const [more, setMore] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState(params.get('q') ?? '')

  const get = (k: (typeof FILTER_KEYS)[number]) => params.get(k) ?? ''
  // Várias chaves de uma vez: duas chamadas seguidas de setParams perderiam a primeira.
  const setMany = (values: Partial<Record<(typeof FILTER_KEYS)[number], string>>) =>
    setParams(
      (p) => {
        for (const [k, v] of Object.entries(values)) {
          if (v) p.set(k, v)
          else p.delete(k)
        }
        return p
      },
      { replace: true },
    )
  const set = (k: (typeof FILTER_KEYS)[number], v: string) => setMany({ [k]: v })
  const query = Object.fromEntries(FILTER_KEYS.flatMap((k) => (params.get(k) ? [[k, params.get(k)!]] : [])))
  const queryKey = new URLSearchParams(query).toString()
  const hasFilters = FILTER_KEYS.some((k) => k !== 'situacao' && k !== 'ordem' && params.get(k))

  // Não há evento para isso na lista; uma consulta leve a cada 10 s basta.
  const [ativas, setAtivas] = useState<Record<string, string[]>>({})
  useEffect(() => {
    const load = () =>
      api<Record<string, string[]>>('/demandas/ativas')
        .then(setAtivas)
        .catch(() => {})
    load()
    const t = setInterval(load, 10_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    api<DemandasMeta>('/demandas/meta')
      .then(setMeta)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Falhou'))
  }, [])

  // Busca só depois de uma pausa na digitação.
  useEffect(() => {
    const t = setTimeout(() => search !== get('q') && set('q', search), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  useEffect(() => {
    let stale = false
    setLoading(true)
    setMore(1)
    api<DemandaPage>(`/demandas?${queryKey}`)
      .then((p) => !stale && (setPage(p), setError(null)))
      .catch((e) => !stale && setError(e instanceof ApiError ? e.message : 'Falhou'))
      .finally(() => !stale && setLoading(false))
    return () => {
      stale = true
    }
  }, [queryKey])

  const loadMore = () => {
    const next = more + 1
    setLoading(true)
    api<DemandaPage>(`/demandas?${new URLSearchParams({ ...query, pagina: String(next) })}`)
      .then((p) => {
        setPage((cur) => cur && { ...p, items: [...cur.items, ...p.items] })
        setMore(next)
      })
      .finally(() => setLoading(false))
  }

  const notConnected = error?.includes('Conexões')
  const situacao = get('situacao') || 'abertas'
  const statuses =
    meta?.statuses.filter((s) => (situacao === 'fechadas' ? s.closed : situacao === 'todas' ? true : !s.closed && s.testing === (situacao === 'teste'))) ?? []

  return (
    <>
      <Topbar crumbs={['Demandas']} />
      <div className="flex min-w-0 flex-1 flex-col gap-6 px-8 py-7">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-medium tracking-[-0.025em]">Demandas</h1>
          <span className="text-muted-foreground">
            Do OpenProject{page && ` · ${page.total} ${page.total === 1 ? 'demanda' : 'demandas'}`}
          </span>
        </div>

        {notConnected ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-16 text-center">
            <div className="font-medium">OpenProject não conectado</div>
            <p className="max-w-sm text-muted-foreground">Conecte com o endereço e um token de API para ver as suas demandas aqui.</p>
            <Button className="mt-2" onClick={() => navigate('/conexoes')}>
              Ir para Conexões
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Tabs value={get('situacao') || 'abertas'} onValueChange={(v) => setMany({ status: '', situacao: v === 'abertas' ? '' : v })}>
                  <TabsList>
                    <TabsTrigger value="abertas">Abertas</TabsTrigger>
                    <TabsTrigger value="teste">Em teste</TabsTrigger>
                    <TabsTrigger value="fechadas">Finalizadas</TabsTrigger>
                    <TabsTrigger value="todas">Todas</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="relative ml-auto w-[280px]">
                  <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por assunto ou número" className="h-8 pl-8" />
                </div>
                <FilterSelect value={get('ordem') || 'atualizacao'} onChange={(v) => set('ordem', v === 'atualizacao' ? '' : v)} active={false} options={ORDENS} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <FilterSelect value={get('escopo') || 'atribuidas'} onChange={(v) => set('escopo', v === 'atribuidas' ? '' : v)} active={!!get('escopo')} options={ESCOPOS} />
                <FilterSelect value={get('projeto')} onChange={(v) => set('projeto', v)} all="Todos os projetos" options={meta?.projects.map((p) => ({ id: p.id, label: p.name })) ?? []} />
                <FilterSelect value={get('tipo')} onChange={(v) => set('tipo', v)} all="Todos os tipos" options={meta?.types.map((t) => ({ id: t.id, label: t.name })) ?? []} />
                <FilterSelect value={get('status')} onChange={(v) => set('status', v)} all="Todos os status" options={statuses.map((s) => ({ id: s.id, label: s.name }))} />
                <FilterSelect value={get('prioridade')} onChange={(v) => set('prioridade', v)} all="Qualquer prioridade" options={meta?.priorities.map((p) => ({ id: p.id, label: p.name })) ?? []} />
                <FilterSelect value={get('prazo')} onChange={(v) => set('prazo', v)} all="Qualquer prazo" options={PRAZOS} />
                {hasFilters && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => {
                      setSearch('')
                      setMany({ escopo: '', status: '', projeto: '', tipo: '', prioridade: '', prazo: '', q: '' })
                    }}
                  >
                    <X className="size-3.5" />
                    Limpar filtros
                  </Button>
                )}
              </div>
            </div>

            {error && <span className="text-[13px] text-destructive">{error}</span>}

            <div className="overflow-hidden rounded-[14px] border border-line">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px] pl-5">#</TableHead>
                    <TableHead>Assunto</TableHead>
                    <TableHead className="w-[170px]">Status</TableHead>
                    <TableHead className="w-[120px]">Prioridade</TableHead>
                    <TableHead className="w-[190px]">Prazo</TableHead>
                    <TableHead className="w-[110px] pr-5">Atualizada</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!page &&
                    loading &&
                    Array.from({ length: 6 }, (_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={6} className="px-5">
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      </TableRow>
                    ))}
                  {page?.items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        Nenhuma demanda com esses filtros
                      </TableCell>
                    </TableRow>
                  )}
                  {page?.items.map((d) => (
                    <TableRow key={d.id} className="cursor-pointer" onClick={() => navigate(`/demandas/${d.id}`)}>
                      <TableCell className="pl-5 font-mono text-[13px] text-muted-foreground">
                        <a href={d.url} target="_blank" rel="noreferrer" title="Abrir no OpenProject" onClick={(e) => e.stopPropagation()} className=" underline-offset-2 hover:text-foreground hover:underline">
                          #{d.id}
                        </a>
                      </TableCell>
                      <TableCell className="max-w-0">
                        <div className="flex items-center gap-2">
                          <Link to={`/demandas/${d.id}`} className="truncate font-medium" onClick={(e) => e.stopPropagation()}>
                            {d.subject}
                          </Link>
                          {ativas[d.id] && (
                            <span title={`Claude rodando: ${ativas[d.id].join('; ')}`} className="flex shrink-0 items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[12px] font-medium text-success">
                              <span className="size-1.5 animate-pulse rounded-full bg-current" />
                              Claude
                            </span>
                          )}
                        </div>
                        <span className="block truncate text-[12.5px] text-muted-foreground">
                          {[d.project?.name, d.type?.name].filter(Boolean).join(' · ')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <DemandaStatusBadge status={d.status} meta={meta} />
                      </TableCell>
                      <TableCell>
                        <Priority priority={d.priority} />
                      </TableCell>
                      <TableCell>
                        <DueDate date={d.dueDate} closed={isDueDateSettled(d.status, meta)} />
                      </TableCell>
                      <TableCell className="pr-5 text-muted-foreground">{timeAgo(d.updatedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {page && page.items.length < page.total && (
              <Button variant="outline" className="self-center" disabled={loading} onClick={loadMore}>
                Carregar mais ({page.total - page.items.length})
              </Button>
            )}
          </>
        )}
      </div>
    </>
  )
}
