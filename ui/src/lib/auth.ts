import { createContext, useContext } from 'react'
import type { User } from '@studio/shared'

export const AuthContext = createContext<{ user: User; refresh: () => Promise<void> } | null>(null)

export function useAuth() {
  return useContext(AuthContext)!
}
