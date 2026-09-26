export type Health = { ok: true; version: string }

// Formato do workspace.json na raiz do workspace.
export type Manifest = {
  name: string
  repos: ManifestRepo[]
}

export type ManifestRepo = {
  name: string
  remote: string | null
  defaultBranch: string
}

export type Workspace = {
  id: string
  name: string
  path: string
  repoCount: number
}

export type RepoStatus = ManifestRepo & {
  present: boolean
  branch: string | null
  changes: number
  unpushed: string[]
}

export type WorkspaceDetail = Workspace & { repos: RepoStatus[] }

export type ApiError = { error: string; reasons?: string[] }

export type TicketStatus = 'running' | 'done' | 'error' | 'interrupted'

export type Ticket = {
  id: string
  workspaceId: string
  title: string
  description: string
  repos: string[]
  model: string
  status: TicketStatus
  branch: string
  taskDir: string
  sessionId: string | null
  createdAt: string
}

export type NewTicket = { title: string; description: string; repos: string[]; model: string }

// Evento do agente já traduzido pelo adaptador; é o que fica gravado e vai para a UI.
export type AgentEvent =
  | { type: 'user'; text: string }
  | { type: 'start'; sessionId: string; model: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; error: boolean; output: string }
  | { type: 'result'; ok: boolean; costUsd: number; durationMs: number; turns: number; error?: string }

export type TicketEvent = { seq: number; at: string; event: AgentEvent }

export type TicketDetail = Ticket & { events: TicketEvent[] }

export type WsMessage = { kind: 'event'; event: TicketEvent } | { kind: 'ticket'; ticket: Ticket }
