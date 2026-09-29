export type Health = { ok: true; version: string }

export type User = { id: string; username: string; name: string; email: string; admin: boolean }

// suggested: nome e e-mail do git da máquina, para preencher o primeiro cadastro.
// setupCode: o cadastro inicial pede o código mostrado no fim da instalação.
export type AuthState = { user: User | null; needsSetup: boolean; setupCode?: boolean; suggested?: { name: string; email: string } }

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
  // Admin sem containers: usa o login do Claude/Codex desta máquina.
  machine: boolean
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

// Modelo que a conta conectada oferece. No Codex, id vazio é o padrão da conta.
export type AgentModel = { id: string; label: string }

export type Ticket = {
  id: string
  workspaceId: string
  title: string
  description: string
  repos: string[]
  // O agente escolhe os repos na spec; até a aprovação, repos são todos os do workspace.
  pickRepos: boolean
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
  // Liga/desliga durante a criação ou a execução: pedidos de permissão de ferramenta passam
  // direto, exceto AskUserQuestion e comandos git de commit/push/troca de branch.
  autonomous: boolean
  // repo -> URL do PR aberto pelo studio
  prs: Record<string, string>
  // Nome de quem criou.
  author: string | null
  createdAt: string
  // Soma das durações informadas nos eventos result; null enquanto não houver resultado.
  durationMs: number | null
  // Data do evento persistido mais recente; se não houver eventos, equivale a createdAt.
  updatedAt: string
}

// sdd false: ticket rápido, começa direto na implementação.
// repos vazio (só com spec): o agente decide.
// images: ids devolvidos por POST /api/images.
export type NewTicket = { title: string; description: string; repos: string[]; agent: AgentKind; model: string; sdd: boolean; gates: DocStage[]; autonomous?: boolean; images?: string[] }

// Conteúdo de spec.md e plan.md; null enquanto o agente não escreveu.
export type TicketDocs = Record<DocStage, string | null>

// Evento do agente já traduzido pelo adaptador; é o que fica gravado e vai para a UI.
export type AgentEvent =
  // images: ids das imagens anexadas; ausente nos eventos antigos.
  | { type: 'user'; text: string; images?: string[] }
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
  // Conversar: o agente propôs um ticket; vira cartão que a pessoa confirma ou descarta.
  | { type: 'proposal'; id: string; proposal: TicketProposal }
  // ticketId ausente: descartada.
  | { type: 'proposal_done'; id: string; ticketId?: string }

export type TicketProposal = { title: string; description: string; repos: string[]; improvementId?: string }

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

// Modo Conversar: conversa sobre o código do workspace, sem editar arquivos; só propõe tickets e mexe nas melhorias.
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

export type NewConversation = { text: string; agent: AgentKind; model: string; images?: string[] }

// O que vai para o agente numa mensagem: texto e ids das imagens anexadas.
export type Prompt = { text: string; images: string[] }

export type UploadedImage = { id: string }

// open: aberta; ticket: virou ticket (ticketId); done: feita.
export type ImprovementStatus = 'open' | 'ticket' | 'done'

export type Improvement = {
  id: string
  workspaceId: string
  title: string
  description: string
  status: ImprovementStatus
  ticketId: string | null
  author: string | null
  createdAt: string
  updatedAt: string
}

export type NewImprovement = { title: string; description?: string }

export type ImprovementPatch = { title?: string; description?: string; status?: ImprovementStatus; ticketId?: string | null }

// text: MELHORIAS.md achado na raiz dos repos (vazio se não houver).
export type ImportPreview = { text: string }

// dryRun: só conta o que seria criado e o que seria pulado.
export type ImprovementImport = { created: number; skipped: number }

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
