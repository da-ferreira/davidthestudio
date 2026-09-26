import type { ApiError as ApiErrorBody } from '@studio/shared'

export class ApiError extends Error {
  reasons: string[]
  constructor(message: string, reasons: string[] = []) {
    super(message)
    this.reasons = reasons
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })
  const data = await res.json().catch(() => null)
  // Sessão vencida ou removida: a tela volta para o login.
  if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('studio:signed-out'))
  if (!res.ok) {
    const err = data as ApiErrorBody | null
    throw new ApiError(err?.error ?? `Erro ${res.status}`, err?.reasons)
  }
  return data as T
}
