export type Health = { ok: true; version: string }

export type User = { id: string; username: string; name: string; email: string; admin: boolean }

// suggested: nome e e-mail do git da máquina, para preencher o primeiro cadastro.
export type AuthState = { user: User | null; needsSetup: boolean; suggested?: { name: string; email: string } }

export type NewUser = { username: string; name: string; email: string; password: string }

export type Invite = { id: string; createdAt: string; expiresAt: string }

// login: entrada pela assinatura em andamento. O Claude devolve um código para colar aqui;
// o Codex mostra um código para digitar no site dele.
export type AgentStatus = {
  connected: boolean
  method: 'subscription' | 'apikey' | null
  // Conta ou final da chave, para a pessoa saber com o que está conectada.
  account: string | null
  login: { url: string; code: string | null } | null
}

export type Connections = { claude: AgentStatus; codex: AgentStatus; github: GithubStatus }

// machine: sem token próprio, o admin usa o git e o gh já autenticados na máquina.
export type GithubStatus = { connected: boolean; account: string | null; machine: boolean }

// Formato do workspace.json na raiz do workspace.
export type ImportResult = { workspace: Workspace; failed: { name: string; error: string }[] }

export type Manifest = {
  name: string
  repos: ManifestRepo[]
}

export type ManifestRepo = {
  name: string
  remote: string | null
  defaultBranch: string
  // Comando que roda os testes na worktree. Ausente: ainda não sugerido; null: o humano deixou sem.
  test?: string | null
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
  hasEnv: boolean
}

// Como os agentes leem o contexto da raiz do workspace. 'unified': CLAUDE.md só importa o
// AGENTS.md, então Claude e Codex leem o mesmo arquivo.
export type ContextFiles = 'unified' | 'claude' | 'agents' | 'both' | 'none'

export type WorkspaceDetail = Workspace & { repos: RepoStatus[]; context: ContextFiles }

export type ApiError = { error: string; reasons?: string[] }

// waiting: o agente parou numa pergunta ou pedido de permissão e espera a resposta na tela.
// approval: a spec ou o plano ficou pronto e espera o humano aprovar.
// closed/discarded: encerrado; as worktrees foram removidas e o diff ficou gravado.
export type TicketStatus = 'running' | 'waiting' | 'approval' | 'done' | 'error' | 'interrupted' | 'closed' | 'discarded'

export type Stage = 'spec' | 'plan' | 'implement' | 'review'

// Etapas que produzem documento e podem parar para aprovação.
export type DocStage = 'spec' | 'plan'

export type AgentKind = 'claude' | 'codex'

export type Ticket = {
  id: string
  workspaceId: string
  title: string
  description: string
  repos: string[]
  agent: AgentKind
  // No Codex, vazio é o modelo padrão da conta.
  model: string
  status: TicketStatus
  branch: string
  taskDir: string
  sessionId: string | null
  stage: Stage
  // Etapas que param para o humano aprovar; as outras avançam sozinhas.
  gates: DocStage[]
  // repo -> URL do PR aberto pelo studio
  prs: Record<string, string>
  // Nome de quem criou.
  author: string | null
  createdAt: string
}

// sdd false: ticket rápido, começa direto na implementação.
export type NewTicket = { title: string; description: string; repos: string[]; agent: AgentKind; model: string; sdd: boolean; gates: DocStage[] }

// Conteúdo de spec.md e plan.md; null enquanto o agente não escreveu.
export type TicketDocs = Record<DocStage, string | null>

// Evento do agente já traduzido pelo adaptador; é o que fica gravado e vai para a UI.
export type AgentEvent =
  | { type: 'user'; text: string }
  | { type: 'start'; sessionId: string; model: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; error: boolean; output: string }
  // Claude informa custo em US$; Codex, só tokens.
  | { type: 'result'; ok: boolean; costUsd?: number; tokens?: number; durationMs: number; turns: number; error?: string }
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

// Modo Perguntar: conversa só de leitura no workspace, sem ticket.
export type ConversationStatus = 'running' | 'idle' | 'error' | 'interrupted'

export type Conversation = {
  id: string
  workspaceId: string
  title: string
  agent: AgentKind
  model: string
  status: ConversationStatus
  authorId: string
  author: string | null
  createdAt: string
}

export type NewConversation = { text: string; agent: AgentKind; model: string }

// error: não chegou a rodar até o fim (instalação falhou, tempo esgotado). interrupted: o daemon caiu no meio.
export type TestStatus = 'running' | 'passed' | 'failed' | 'stopped' | 'error' | 'interrupted'

export type TestRun = {
  id: number
  ticketId: string
  repo: string
  command: string
  status: TestStatus
  exitCode: number | null
  output: string
  startedAt: string
  finishedAt: string | null
}

// Por que avisar antes do commit: nunca rodou, o último não passou, ou o código mudou depois dele.
export type TestWarning = { repo: string; reason: 'never' | 'failed' | 'stale' }

export type WsMessage =
  | { kind: 'event'; event: TicketEvent }
  | { kind: 'ticket'; ticket: Ticket }
  | { kind: 'conversation'; conversation: Conversation }
  | { kind: 'test'; run: TestRun }
  | { kind: 'test-output'; runId: number; chunk: string }

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
