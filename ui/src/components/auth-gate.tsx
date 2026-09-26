import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { AuthState } from '@studio/shared'
import { Cadastro, Entrar } from '@/pages/entrar'
import { AuthContext } from '@/lib/auth'
import { api } from '@/lib/api'

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState | null>(null)

  const refresh = useCallback(() => api<AuthState>('/auth/state').then(setState), [])
  useEffect(() => {
    refresh()
    const onSignedOut = () => setState((s) => (s ? { ...s, user: null } : s))
    window.addEventListener('studio:signed-out', onSignedOut)
    return () => window.removeEventListener('studio:signed-out', onSignedOut)
  }, [refresh])

  if (!state) return null
  if (state.needsSetup) return <Cadastro suggested={state.suggested} onDone={refresh} />
  if (!state.user) return <Entrar onDone={refresh} />
  return <AuthContext.Provider value={{ user: state.user, refresh }}>{children}</AuthContext.Provider>
}
