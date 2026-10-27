import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Tutorial, TutorialStatus } from '@studio/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Topbar } from '@/components/topbar'
import { api } from '@/lib/api'

export const TUTORIAL_STATUS: Record<TutorialStatus, { label: string; className: string }> = {
  planning: { label: 'Listando prints', className: 'bg-info-soft text-info' },
  shots: { label: 'Esperando prints', className: 'bg-warning-soft text-warning' },
  writing: { label: 'Montando', className: 'bg-info-soft text-info' },
  done: { label: 'Pronto', className: 'bg-success-soft text-success' },
  error: { label: 'Falhou', className: 'bg-destructive/10 text-destructive' },
}

export function Tutoriais() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Tutorial[] | null>(null)

  useEffect(() => {
    api<Tutorial[]>('/tutoriais').then(setItems)
  }, [])

  return (
    <>
      <Topbar crumbs={['Tutoriais']} actions={<Button onClick={() => navigate('/tutoriais/novo')}>Novo tutorial</Button>} />
      <div className="flex flex-1 flex-col gap-8 px-8 py-7">
        <h1 className="text-[28px] font-medium tracking-[-0.025em]">Tutoriais</h1>
        {items?.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-16 text-center">
            <div className="font-medium">Nenhum tutorial ainda</div>
            <p className="max-w-sm text-muted-foreground">Conte o que o tutorial deve ensinar; o agente diz quais prints precisa, você anexa e ele monta o passo a passo.</p>
          </div>
        )}
        {!!items?.length && (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Título</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Demanda</TableHead>
                  <TableHead>Autor</TableHead>
                  <TableHead>Criado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => navigate(`/tutoriais/${t.id}`)}>
                    <TableCell className="max-w-[560px] truncate pl-4 font-medium">{t.title}</TableCell>
                    <TableCell>
                      <Badge className={TUTORIAL_STATUS[t.status].className}>{TUTORIAL_STATUS[t.status].label}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.demanda ? (
                        <Link to={`/demandas/${t.demanda.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-foreground">
                          #{t.demanda.id}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.author ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(t.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  )
}
