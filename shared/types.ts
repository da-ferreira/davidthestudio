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

// Como os agentes leem o contexto da raiz do workspace. 'unified': CLAUDE.md só importa o
// AGENTS.md, então Claude e Codex leem o mesmo arquivo.
export type ContextFiles = 'unified' | 'claude' | 'agents' | 'both' | 'none'

export type WorkspaceDetail = Workspace & { repos: RepoStatus[]; context: ContextFiles }

export type ApiError = { error: string; reasons?: string[] }

// waiting: o agente parou numa pergunta ou pedido de permissão e espera a resposta na tela.
// closed/discarded: encerrado; as worktrees foram removidas e o diff ficou gravado.
export type TicketStatus = 'running' | 'waiting' | 'done' | 'error' | 'interrupted' | 'closed' | 'discarded'

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
  // repo -> URL do PR aberto pelo studio
  prs: Record<string, string>
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
  | { type: 'ask'; id: string; ask: Ask }
  | { type: 'answer'; id: string; reply: Reply }
  // Ações do próprio studio (commit, PR), para ficarem no histórico do ticket.
  | { type: 'note'; text: string; url?: string }

export type Question = {
  question: string
  header: string
  options: { label: string; description: string }[]
  multiSelect: boolean
}

// O que o agente pede ao humano no meio da execução.
export type Ask =
  | { kind: 'permission'; tool: string; title: string; detail: string }
  | { kind: 'question'; questions: Question[] }

// answers: texto da pergunta -> resposta (várias opções separadas por vírgula).
export type Reply = { allow: boolean; answers?: Record<string, string> }

export type TicketEvent = { seq: number; at: string; event: AgentEvent }

export type TicketDetail = Ticket & { events: TicketEvent[] }

export type WsMessage = { kind: 'event'; event: TicketEvent } | { kind: 'ticket'; ticket: Ticket }

export type FileChange = { path: string; status: 'A' | 'M' | 'D'; additions: number; deletions: number; patch: string }

export type RepoDiff = {
  repo: string
  base: string
  files: FileChange[]
  uncommitted: number
  commits: { sha: string; subject: string }[]
  unpushed: number
  pr: string | null
}
