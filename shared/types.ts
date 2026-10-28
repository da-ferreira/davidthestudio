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

// url: endereço base do OpenProject; account: nome do usuário lá.
export type OpenProjectStatus = { connected: boolean; url: string | null; account: string | null }

// link: rota da própria tela (ticket, demanda) para onde o clique leva.
export type StudioNotification = {
  id: string
  source: 'studio' | 'openproject'
  title: string
  body: string
  link: string | null
  read: boolean
  createdAt: string
}

export type NotificationList = { items: StudioNotification[]; unread: number }

// Demandas: hoje vêm do OpenProject. ids são os da origem.
export type DemandaRef = { id: string; name: string }

// Quem dá para marcar com @ num comentário: membros do projeto da demanda.
export type DemandaPerson = { id: string; name: string; type: 'user' | 'group' }
export type DemandaStatus = DemandaRef & { closed: boolean; color: string | null }
export type DemandasMeta = { statuses: DemandaStatus[]; types: DemandaRef[]; priorities: DemandaRef[]; projects: DemandaRef[] }

export type Demanda = {
  id: number
  subject: string
  project: DemandaRef | null
  type: DemandaRef | null
  status: DemandaRef | null
  priority: DemandaRef | null
  // Em pessoas o id é o href do OpenProject, porque pode ser usuário, grupo ou marcador.
  assignee: DemandaRef | null
  responsible: DemandaRef | null
  startDate: string | null
  dueDate: string | null
  // Dias úteis entre início e término, como o OpenProject calcula.
  durationDays: number | null
  percentDone: number | null
  createdAt: string
  updatedAt: string
  // Endereço da demanda na origem, para abrir lá.
  url: string
}

// Filtros da lista, iguais aos parâmetros da URL da tela.
export type DemandaQuery = {
  escopo?: 'atribuidas' | 'responsavel' | 'observando' | 'criadas' | 'todas'
  situacao?: 'abertas' | 'fechadas' | 'todas'
  status?: string
  projeto?: string
  tipo?: string
  prioridade?: string
  prazo?: 'atrasadas' | 'hoje' | 'semana' | 'sem'
  q?: string
  ordem?: 'atualizacao' | 'prazo' | 'prioridade' | 'id' | 'criacao'
  pagina?: number
}

export type DemandaPage = { items: Demanda[]; total: number; pageSize: number }

// comment: texto do comentário (markdown); details: mudanças de campo já descritas pela origem.
export type DemandaActivity = {
  id: string
  author: string | null
  createdAt: string
  comment: string
  details: string[]
  // Para editar: o texto como foi escrito, com as marcações de volta a "@Nome", e quem estava marcado.
  edit: { text: string; mentions: DemandaPerson[] } | null
}

export type DemandaAttachment = { id: string; fileName: string; size: number; contentType: string; author: string | null; createdAt: string }

export type DemandaDetail = Demanda & {
  description: string
  author: string | null
  activities: DemandaActivity[]
  attachments: DemandaAttachment[]
  // Versão para o OpenProject recusar a edição se alguém mudou a demanda nesse meio-tempo.
  lockVersion: number
  can: { edit: boolean; comment: boolean; attach: boolean }
  // null: o OpenProject não deixa observar esta demanda.
  watching: boolean | null
}

export type DemandaField = 'subject' | 'status' | 'priority' | 'assignee' | 'responsible' | 'startDate' | 'dueDate' | 'percentDone'

// Só os campos que o OpenProject deixa editar agora; options para os de escolha.
export type DemandaEditOptions = Partial<Record<DemandaField, { options?: DemandaRef[] }>>

export type DemandaPatch = {
  lockVersion: number
  subject?: string
  status?: string
  priority?: string
  assignee?: string | null
  responsible?: string | null
  startDate?: string | null
  dueDate?: string | null
  percentDone?: number | null
}

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
  // Demanda do OpenProject de onde o ticket nasceu; recebe um comentário com o link de cada PR.
  demanda: { id: string; url: string } | null
  // Nome de quem criou.
  author: string | null
  createdAt: string
  // Soma das durações informadas nos eventos result; null enquanto não houver resultado.
  durationMs: number | null
  // Data do evento persistido mais recente; se não houver eventos, equivale a createdAt.
  updatedAt: string
  // O Claude interativo está aberto na pasta da tarefa; enquanto isso o chat do ticket fica bloqueado.
  terminal: boolean
}

// sdd false: ticket rápido, começa direto na implementação.
// repos vazio (só com spec): o agente decide.
// images: ids devolvidos por POST /api/images.
// terminal: cria as worktrees sem rodar o agente pela tela; o pedido vira o primeiro prompt do terminal.
export type NewTicket = { title: string; description: string; repos: string[]; agent: AgentKind; model: string; sdd: boolean; gates: DocStage[]; autonomous?: boolean; images?: string[]; demanda?: string; terminal?: boolean }

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
  | { kind: 'notification'; notification: StudioNotification }
  | { kind: 'notifications' }

// Mensagens do WebSocket /ws/terminal. Do daemon: saída do pty, fim do processo ou erro ao abrir.
export type TerminalOut = { type: 'ready' } | { type: 'data'; data: string } | { type: 'exit'; code: number } | { type: 'error'; message: string }
export type TerminalIn = { type: 'input'; data: string } | { type: 'resize'; cols: number; rows: number } | { type: 'kill' }

export type FileChange = { path: string; status: 'A' | 'M' | 'D'; additions: number; deletions: number; patch: string }

// Janela de limite da assinatura como o provedor informa. key: five_hour, seven_day, primary...
export type UsageWindow = { key: string; label: string; utilization: number; resetsAt: string | null }

// Gasto somado dos eventos result do usuário. null: nenhum evento trouxe o valor.
export type UsageSpend = { unit: 'usd' | 'tokens'; today: number | null; week: number | null }

// apikey: conectado por chave, sem limite de assinatura. error: não deu para ler os limites.
export type ProviderUsage = {
  agent: AgentKind
  account: string | null
  state: 'ok' | 'disconnected' | 'apikey' | 'error'
  windows: UsageWindow[]
  spend: UsageSpend
}

export type Usage = { claude: ProviderUsage; codex: ProviderUsage }

export type RepoDiff = {
  repo: string
  base: string
  files: FileChange[]
  uncommitted: number
  commits: { sha: string; subject: string }[]
  unpushed: number
  pr: string | null
}

// planning: o agente lista os prints; shots: esperando as imagens; writing: o agente monta o tutorial.
export type TutorialStatus = 'planning' | 'shots' | 'writing' | 'done' | 'error'

// image: id em /api/images; null enquanto a pessoa não anexou (ou decidiu pular).
export type TutorialShot = { description: string; image: string | null }

export type Tutorial = {
  id: string
  num: number
  title: string
  prompt: string
  model: string
  demanda: { id: string; url: string } | null
  status: TutorialStatus
  shots: TutorialShot[]
  error: string | null
  ready: boolean
  author: string | null
  createdAt: string
  updatedAt: string
}

export type NewTutorial = { title: string; prompt: string; model: string; demanda?: string }

// Cores no formato do tema do xterm.js (background, foreground, black…brightWhite).
export type TerminalTheme = Record<string, string>

// Fonte e cores do perfil padrão do iTerm2, para o terminal do studio ficar igual; null usa as do studio.
export type TerminalLook = { fonts: string[]; size: number; theme: { light: TerminalTheme; dark: TerminalTheme } | null } | null
