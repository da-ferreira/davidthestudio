import { useSyncExternalStore } from 'react'

// Conversa que o balão flutuante mantém aberta entre telas. conversationId null: nova conversa.
export type ActiveChat = { workspaceId: string; conversationId: string | null }

const KEY = 'studio-active-chat'
const listeners = new Set<() => void>()

function read(): ActiveChat | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
}

let current = read()

export function setActiveChat(chat: ActiveChat) {
  if (current?.workspaceId === chat.workspaceId && current.conversationId === chat.conversationId) return
  current = chat
  try {
    localStorage.setItem(KEY, JSON.stringify(chat))
  } catch {}
  listeners.forEach((l) => l())
}

export function useActiveChat() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}
