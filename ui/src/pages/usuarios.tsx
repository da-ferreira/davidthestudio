import { useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { Check, Copy } from 'lucide-react'
import type { Invite, User } from '@studio/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Topbar } from '@/components/topbar'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

const date = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function Usuarios() {
  const { user } = useAuth()
  const [users, setUsers] = useState<User[] | null>(null)
  const [invites, setInvites] = useState<Invite[]>([])
  const [link, setLink] = useState<string | null>(null)
  const [removing, setRemoving] = useState<User | null>(null)

  useEffect(() => {
    if (!user.admin) return
    api<User[]>('/admin/users').then(setUsers)
    api<Invite[]>('/admin/invites').then(setInvites)
  }, [user.admin])

  if (!user.admin) return <Navigate to="/" replace />

  const invite = async () => {
    const { token } = await api<{ token: string }>('/admin/invites', { method: 'POST' })
    setLink(`${location.origin}/convite/${token}`)
    setInvites(await api<Invite[]>('/admin/invites'))
  }

  return (
    <>
      <Topbar crumbs={['Usuários']} actions={<Button onClick={invite}>Convidar</Button>} />
      <div className="flex flex-1 flex-col gap-8 px-8 py-7">
        <h1 className="text-[28px] font-medium tracking-[-0.025em]">Usuários</h1>
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Nome</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="pl-4 font-medium">
                    {u.name}
                    {u.admin && <Badge className="ml-2 bg-neutral-100 text-neutral-600">Administrador</Badge>}
                  </TableCell>
                  <TableCell className="font-mono text-[13px] text-muted-foreground">{u.username}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-right">
                    {u.id !== user.id && (
                      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setRemoving(u)}>
                        Remover acesso
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!!invites.length && (
          <section className="flex flex-col gap-3">
            <h2 className="font-medium">Convites pendentes</h2>
            <div className="rounded-xl border">
              <Table>
                <TableBody>
                  {invites.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="pl-4 text-muted-foreground">Criado em {date(i.createdAt)}</TableCell>
                      <TableCell className="text-muted-foreground">Vence em {date(i.expiresAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground"
                          onClick={() => api<Invite[]>(`/admin/invites/${i.id}`, { method: 'DELETE' }).then(setInvites)}
                        >
                          Cancelar convite
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}
      </div>
      <InviteDialog link={link} onClose={() => setLink(null)} />
      <AlertDialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover o acesso de {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>A pessoa sai na hora e não entra mais. Os tickets dela continuam no studio.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => api<User[]>(`/admin/users/${removing!.id}`, { method: 'DELETE' }).then(setUsers)}>Remover acesso</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function InviteDialog({ link, onClose }: { link: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(link!)
    setCopied(true)
  }

  return (
    <Dialog
      open={!!link}
      onOpenChange={(v) => {
        if (!v) onClose()
        setCopied(false)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link de convite</DialogTitle>
          <DialogDescription>Mande para a pessoa. Vale por 7 dias e para uma conta só; depois de fechar esta janela, o link não aparece de novo.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={link ?? ''} className="font-mono text-[13px]" onFocus={(e) => e.target.select()} />
          <Button variant="outline" className="h-9" onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
