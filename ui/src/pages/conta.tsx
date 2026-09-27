import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Topbar } from '@/components/topbar'
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export function Conta() {
  const { user, refresh } = useAuth()
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<{ form: 'profile' | 'password'; ok: boolean; text: string } | null>(null)

  const act = (form: 'profile' | 'password', fn: () => Promise<unknown>, ok: string) => async (e: FormEvent) => {
    e.preventDefault()
    try {
      await fn()
      setMsg({ form, ok: true, text: ok })
    } catch (err) {
      setMsg({ form, ok: false, text: err instanceof ApiError ? err.message : 'Falhou' })
    }
  }

  const saveProfile = act('profile', () => api('/me', { method: 'PUT', body: { name, email } }).then(refresh), 'Salvo')
  const savePassword = act(
    'password',
    () =>
      api('/me/password', { method: 'PUT', body: { current, password } }).then(() => {
        setCurrent('')
        setPassword('')
      }),
    'Senha trocada; as outras sessões foram encerradas',
  )

  const note = (form: 'profile' | 'password') =>
    msg?.form === form && <span className={`text-[13px] ${msg.ok ? 'text-muted-foreground' : 'text-destructive'}`}>{msg.text}</span>

  return (
    <>
      <Topbar crumbs={['Minha conta']} />
      <div className="flex flex-1 flex-col gap-6 px-8 py-7">
        <h1 className="text-[28px] font-medium tracking-[-0.025em]">Minha conta</h1>
        <form onSubmit={saveProfile} className="flex max-w-[480px] flex-col gap-4 rounded-[14px] border border-line px-5 py-4">
          <div className="flex flex-col gap-1">
            <span className="font-medium">Perfil</span>
            <span className="text-[13px] text-muted-foreground">
              Usuário <span className="font-mono">{user.username}</span>. Nome e e-mail assinam os commits que você aprovar.
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm">
              Salvar
            </Button>
            {note('profile')}
          </div>
        </form>
        <form onSubmit={savePassword} className="flex max-w-[480px] flex-col gap-4 rounded-[14px] border border-line px-5 py-4">
          <span className="font-medium">Senha</span>
          <div className="flex flex-col gap-2">
            <Label>Senha atual</Label>
            <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Nova senha</Label>
            <Input type="password" autoComplete="new-password" placeholder="ao menos 8 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" variant="outline" disabled={!current || !password}>
              Trocar senha
            </Button>
            {note('password')}
          </div>
        </form>
      </div>
    </>
  )
}
