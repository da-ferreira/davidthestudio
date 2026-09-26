import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { NewUser } from '@studio/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api } from '@/lib/api'

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-white px-4 py-10">
      <span className="text-[19px] font-semibold tracking-[-0.03em]">david the studio</span>
      <div className="flex w-full max-w-[380px] flex-col gap-6 rounded-[18px] border p-7 shadow-[0_4px_16px_rgba(0,0,0,.05)]">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[20px] font-medium tracking-[-0.02em]">{title}</h1>
          {subtitle && <p className="text-[14px] text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function useSubmit(fn: () => Promise<unknown>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falhou')
      setBusy(false)
    }
  }
  return { busy, error, submit }
}

export function Entrar({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const { busy, error, submit } = useSubmit(() => api('/auth/login', { method: 'POST', body: { username, password } }).then(onDone))

  return (
    <Card title="Entrar">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Usuário">
          <Input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Senha">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="text-[13px] text-destructive">{error}</p>}
        <Button type="submit" size="lg" disabled={busy || !username || !password}>
          Entrar
        </Button>
      </form>
    </Card>
  )
}

function NewUserFields({ value, onChange }: { value: NewUser; onChange: (v: NewUser) => void }) {
  const set = (k: keyof NewUser) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value })
  return (
    <>
      <Field label="Usuário">
        <Input autoFocus autoComplete="username" placeholder="ex.: david" value={value.username} onChange={set('username')} />
      </Field>
      <Field label="Nome">
        <Input autoComplete="name" value={value.name} onChange={set('name')} />
      </Field>
      <Field label="E-mail">
        <Input type="email" autoComplete="email" value={value.email} onChange={set('email')} />
      </Field>
      <Field label="Senha">
        <Input type="password" autoComplete="new-password" placeholder="ao menos 8 caracteres" value={value.password} onChange={set('password')} />
      </Field>
      <p className="text-[13px] text-muted-foreground">Nome e e-mail assinam os commits que você aprovar.</p>
    </>
  )
}

export function Cadastro({ suggested, askCode, onDone }: { suggested?: { name: string; email: string }; askCode: boolean; onDone: () => void }) {
  const [u, setU] = useState<NewUser>({ username: '', name: suggested?.name ?? '', email: suggested?.email ?? '', password: '' })
  const [setupCode, setSetupCode] = useState('')
  const { busy, error, submit } = useSubmit(() => api('/auth/setup', { method: 'POST', body: { ...u, setupCode } }).then(onDone))

  return (
    <Card title="Primeiro acesso" subtitle="Crie o administrador. Os outros usuários entram por convite seu.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {askCode && (
          <Field label="Código de instalação">
            <Input autoComplete="off" spellCheck={false} className="font-mono" placeholder="mostrado no fim da instalação" value={setupCode} onChange={(e) => setSetupCode(e.target.value)} />
          </Field>
        )}
        <NewUserFields value={u} onChange={setU} />
        {error && <p className="text-[13px] text-destructive">{error}</p>}
        <Button type="submit" size="lg" disabled={busy}>
          Criar administrador
        </Button>
      </form>
    </Card>
  )
}

export function Convite() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [valid, setValid] = useState<boolean | null>(null)
  const [u, setU] = useState<NewUser>({ username: '', name: '', email: '', password: '' })
  // Recarrega a página inteira para o AuthGate ler a sessão nova.
  const { busy, error, submit } = useSubmit(() => api(`/auth/invites/${token}`, { method: 'POST', body: u }).then(() => location.assign('/')))

  useEffect(() => {
    api(`/auth/invites/${token}`)
      .then(() => setValid(true))
      .catch(() => setValid(false))
  }, [token])

  if (valid === null) return null
  if (!valid)
    return (
      <Card title="Convite inválido" subtitle="Este convite venceu ou já foi usado. Peça um novo ao administrador.">
        <Button variant="outline" onClick={() => navigate('/')}>
          Ir para o login
        </Button>
      </Card>
    )
  return (
    <Card title="Criar sua conta" subtitle="Você foi convidado para o david the studio.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <NewUserFields value={u} onChange={setU} />
        {error && <p className="text-[13px] text-destructive">{error}</p>}
        <Button type="submit" size="lg" disabled={busy}>
          Criar conta
        </Button>
      </form>
    </Card>
  )
}
