import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import websocket from '@fastify/websocket'
import type { AgentKind, ApiError, DemandaPatch, DemandaQuery, DocStage, Health, ImprovementPatch, NewConversation, NewImprovement, NewTicket, NewTutorial, NewUser, Reply, TerminalIn, TerminalOut, UploadedImage, User, WsMessage } from '@studio/shared'
import * as auth from './auth.ts'
import { startBackups } from './backup.ts'
import * as conn from './connections.ts'
import { CONTAINERS, ensureImage, IMAGE } from './containers.ts'
import { HttpError } from './http-error.ts'
import * as images from './images.ts'
import * as notifications from './notifications.ts'
import * as openproject from './openproject.ts'
import { draftComment } from './comment-draft.ts'
import * as tests from './tests.ts'
import * as conversations from './conversations.ts'
import * as improvements from './improvements.ts'
import * as terminals from './terminals.ts'
import * as tickets from './tickets.ts'
import * as tutorials from './tutorials.ts'
import * as usage from './usage.ts'
import * as ws from './workspaces.ts'

const PORT = Number(process.env.STUDIO_PORT ?? 4700)
const HOST = process.env.STUDIO_HOST ?? '127.0.0.1'

// Atrás do Caddy o HTTPS termina nele; o cabeçalho X-Forwarded-Proto diz ao daemon para marcar o cookie como Secure.
const app = Fastify({ logger: { level: 'info' }, trustProxy: process.env.STUDIO_TRUST_PROXY === '1' })
await app.register(websocket)

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof HttpError) {
    const body: ApiError = { error: err.message, reasons: err.reasons }
    return reply.status(err.status).send(body)
  }
  app.log.error(err)
  return reply.status(500).send({ error: err instanceof Error ? err.message : 'Erro interno' } satisfies ApiError)
})

declare module 'fastify' {
  interface FastifyRequest {
    user: User
  }
}

// Tudo exige sessão, menos o próprio login, o cadastro inicial e o aceite de convite.
app.addHook('onRequest', async (req) => {
  const url = req.url
  if (url === '/api/health' || url.startsWith('/api/auth/') || !(url.startsWith('/api/') || url.startsWith('/ws/'))) return
  const user = auth.sessionUser(req.headers.cookie)
  if (!user) throw new HttpError(401, 'Entre para continuar')
  req.user = user
  if (url.startsWith('/api/admin/') && !user.admin) throw new HttpError(403, 'Só o administrador pode fazer isso')
})

function agent(a: string): AgentKind {
  if (a !== 'claude' && a !== 'codex') throw new HttpError(404, 'Agente desconhecido')
  return a
}

const setCookie = (reply: FastifyReply, req: FastifyRequest, token: string | null) =>
  reply.header('set-cookie', auth.sessionCookie(token, req.protocol === 'https'))

app.get('/api/health', async (): Promise<Health> => ({ ok: true, version: '0.0.0' }))

app.get('/api/auth/state', async (req) => auth.authState(req.headers.cookie))
app.post<{ Body: NewUser & { setupCode?: string } }>('/api/auth/setup', async (req, reply) => {
  setCookie(reply, req, auth.setup(req.body, req.body?.setupCode))
  return { ok: true }
})
app.post<{ Body: { username: string; password: string } }>('/api/auth/login', async (req, reply) => {
  setCookie(reply, req, auth.login(req.body.username, req.body.password))
  return { ok: true }
})
app.post('/api/auth/logout', async (req, reply) => {
  auth.endSession(req.headers.cookie)
  setCookie(reply, req, null)
  return { ok: true }
})
app.get<{ Params: { token: string } }>('/api/auth/invites/:token', async (req) => auth.checkInvite(req.params.token))
app.post<{ Params: { token: string }; Body: NewUser }>('/api/auth/invites/:token', async (req, reply) => {
  setCookie(reply, req, auth.acceptInvite(req.params.token, req.body))
  return { ok: true }
})

app.put<{ Body: { name: string; email: string } }>('/api/me', async (req) => {
  auth.updateProfile(req.user, req.body)
  return { ok: true }
})
app.put<{ Body: { current: string; password: string } }>('/api/me/password', async (req) => {
  auth.changePassword(req.user, req.headers.cookie, req.body.current, req.body.password)
  return { ok: true }
})

app.get('/api/admin/users', async () => auth.listUsers())
app.delete<{ Params: { id: string } }>('/api/admin/users/:id', async (req) => {
  auth.removeUser(req.user, req.params.id)
  return auth.listUsers()
})
app.get('/api/admin/invites', async () => auth.listInvites())
app.post('/api/admin/invites', async (req) => auth.createInvite(req.user))
app.delete<{ Params: { id: string } }>('/api/admin/invites/:id', async (req) => {
  auth.revokeInvite(req.params.id)
  return auth.listInvites()
})

app.get('/api/me/connections', async (req) => conn.connections(req.user))
app.get('/api/me/usage', async (req) => usage.usage(req.user))
app.post<{ Params: { agent: AgentKind } }>('/api/me/agents/:agent/login', async (req) => {
  await conn.startLogin(req.user, agent(req.params.agent))
  return conn.agentStatus(req.user, req.params.agent)
})
app.get<{ Params: { agent: AgentKind } }>('/api/me/agents/:agent/models', async (req) => conn.agentModels(req.user, agent(req.params.agent)))
app.post<{ Body: { code: string } }>('/api/me/agents/claude/code', async (req) => {
  await conn.submitClaudeCode(req.user, req.body.code)
  return conn.agentStatus(req.user, 'claude')
})
app.post<{ Params: { agent: AgentKind } }>('/api/me/agents/:agent/login/cancel', async (req) => {
  conn.cancelLogin(req.user, agent(req.params.agent))
  return { ok: true }
})
app.post<{ Params: { agent: AgentKind }; Body: { key: string } }>('/api/me/agents/:agent/api-key', async (req) => {
  await conn.saveApiKey(req.user, agent(req.params.agent), req.body.key)
  return conn.agentStatus(req.user, req.params.agent)
})
app.post<{ Params: { agent: AgentKind } }>('/api/me/agents/:agent/logout', async (req) => {
  await conn.logout(req.user, agent(req.params.agent))
  return conn.agentStatus(req.user, req.params.agent)
})
app.put<{ Body: { token: string } }>('/api/me/github', async (req) => {
  await conn.saveGithubToken(req.user, req.body.token)
  return conn.githubStatus(req.user)
})
app.delete('/api/me/github', async (req) => {
  conn.removeGithubToken(req.user)
  return conn.githubStatus(req.user)
})
app.get('/api/me/openproject', async (req) => openproject.openprojectStatus(req.user))
app.put<{ Body: { url: string; token: string } }>('/api/me/openproject', async (req) => {
  await openproject.saveOpenProject(req.user, req.body ?? {})
  return openproject.openprojectStatus(req.user)
})
app.delete('/api/me/openproject', async (req) => {
  openproject.removeOpenProject(req.user)
  return openproject.openprojectStatus(req.user)
})

app.get('/api/demandas/meta', async (req) => openproject.demandasMeta(req.user))
app.get<{ Querystring: DemandaQuery }>('/api/demandas', async (req) => openproject.listDemandas(req.user, req.query))
app.get<{ Params: { id: string } }>('/api/demandas/:id', async (req) => openproject.getDemanda(req.user, req.params.id))
app.get<{ Params: { id: string } }>('/api/demandas/:id/terminal', async (req) => ({ workspaceId: terminals.demandaWorkspace(req.params.id) }))
app.post<{ Params: { id: string }; Body: { workspaceId: string } }>('/api/demandas/:id/terminal/nova', async (req) => {
  terminals.resetRootSession(req.body.workspaceId, req.params.id)
  return { ok: true }
})
app.get('/api/demandas/ativas', async () => tickets.activeDemandas())
app.get('/api/terminal/fonte', async () => terminals.itermFont())
app.get<{ Params: { id: string } }>('/api/demandas/:id/opcoes', async (req) => openproject.demandaEditOptions(req.user, req.params.id))
app.patch<{ Params: { id: string }; Body: DemandaPatch }>('/api/demandas/:id', async (req) => openproject.updateDemanda(req.user, req.params.id, req.body))
app.post<{ Params: { id: string }; Body: { hint?: string } }>('/api/demandas/:id/rascunho', async (req) => ({ text: await draftComment(req.user, req.params.id, req.body?.hint ?? '') }))
app.post<{ Params: { id: string }; Body: { text: string } }>('/api/demandas/:id/comentarios', async (req) => openproject.commentDemanda(req.user, req.params.id, req.body.text ?? ''))
app.post<{ Params: { id: string }; Body: { fileName: string; contentType: string; data: string } }>('/api/demandas/:id/anexos', { bodyLimit: 40 * 1024 * 1024 }, async (req) =>
  openproject.attachToDemanda(req.user, req.params.id, req.body),
)
app.post<{ Params: { id: string }; Body: { watch: boolean } }>('/api/demandas/:id/observar', async (req) => openproject.watchDemanda(req.user, req.params.id, !!req.body.watch))
app.get<{ Params: { id: string } }>('/api/demandas/anexos/:id', async (req, reply) => {
  const res = await openproject.downloadAttachment(req.user, req.params.id)
  for (const h of ['content-type', 'content-disposition', 'content-length']) {
    const v = res.headers.get(h)
    if (v) reply.header(h, v)
  }
  return reply.header('cache-control', 'private, max-age=3600').send(Readable.fromWeb(res.body as never))
})

app.get('/api/tutoriais', async () => tutorials.listTutorials())
app.post<{ Body: NewTutorial }>('/api/tutoriais', async (req) => tutorials.createTutorial(req.body ?? {}, req.user))
app.get<{ Params: { id: string } }>('/api/tutoriais/:id', async (req) => tutorials.getTutorial(req.params.id))
app.delete<{ Params: { id: string } }>('/api/tutoriais/:id', async (req) => {
  tutorials.deleteTutorial(req.params.id, req.user)
  return { ok: true }
})
app.put<{ Params: { id: string; n: string }; Body: { image: string | null } }>('/api/tutoriais/:id/prints/:n', async (req) =>
  tutorials.setShot(req.params.id, Number(req.params.n), req.body?.image ?? null, req.user),
)
app.post<{ Params: { id: string } }>('/api/tutoriais/:id/gerar', async (req) => tutorials.generate(req.params.id, req.user))
app.post<{ Params: { id: string }; Body: { text: string } }>('/api/tutoriais/:id/ajuste', async (req) => tutorials.adjust(req.params.id, req.body?.text ?? '', req.user))
app.post<{ Params: { id: string } }>('/api/tutoriais/:id/anexar', async (req) => tutorials.attachToDemanda(req.params.id, req.user))
app.get<{ Params: { id: string }; Querystring: { baixar?: string } }>('/api/tutoriais/:id/documento', async (req, reply) => {
  const { html, fileName } = tutorials.tutorialDocument(req.params.id)
  if (req.query.baixar) reply.header('content-disposition', `attachment; filename="${fileName}"`)
  // Aberto direto no studio, roda isolado da origem dele, sem script.
  reply.header('content-security-policy', "sandbox allow-modals allow-popups allow-popups-to-escape-sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'")
  return reply.type('text/html; charset=utf-8').header('cache-control', 'no-store').send(html)
})

app.get<{ Params: { id: string } }>('/api/tutoriais/:id/pdf', async (req, reply) => {
  const { pdf, fileName } = await tutorials.tutorialPdf(req.params.id)
  return reply.type('application/pdf').header('content-disposition', `attachment; filename="${fileName}"`).header('cache-control', 'no-store').send(pdf)
})

app.get('/api/notifications', async (req) => notifications.listNotifications(req.user.id))
app.post<{ Body: { ids?: string[] } }>('/api/notifications/read', async (req) => {
  const external = notifications.markRead(req.user.id, req.body?.ids).filter((n) => n.source === 'openproject')
  if (external.length) openproject.markNotificationsRead(req.user, external.map((n) => n.externalId)).catch((e) => req.log.warn(`Não marcou como lida no OpenProject: ${e.message}`))
  return notifications.listNotifications(req.user.id)
})
app.get('/ws/notifications', { websocket: true }, (socket, req) => {
  const off = notifications.subscribe(req.user.id, (m) => socket.send(JSON.stringify(m)))
  socket.on('close', off)
})

app.get('/api/workspaces', async () => ws.listWorkspaces())
app.post<{ Body: { path: string } }>('/api/workspaces', async (req) => ws.registerWorkspace(req.body.path))
app.post<{ Body: { name: string } }>('/api/workspaces/empty', async (req) => ws.createEmptyWorkspace(req.body.name ?? ''))
app.post<{ Body: { url: string } }>('/api/workspaces/import', async (req) => ws.importWorkspace(req.body.url ?? '', req.user))
app.get<{ Params: { id: string } }>('/api/workspaces/:id', async (req) => ws.getWorkspace(req.params.id))
app.delete<{ Params: { id: string } }>('/api/workspaces/:id', async (req) => {
  await ws.removeWorkspace(req.params.id)
  return ws.listWorkspaces()
})
app.post<{ Params: { id: string } }>('/api/workspaces/:id/rescan', async (req) => {
  await ws.rescanWorkspace(req.params.id)
  return ws.getWorkspace(req.params.id)
})
app.post<{ Params: { id: string } }>('/api/workspaces/:id/context/unify', async (req) => {
  ws.unifyContext(req.params.id)
  return ws.getWorkspace(req.params.id)
})

app.post<{ Params: { id: string }; Body: { url: string; branch?: string } }>('/api/workspaces/:id/repos', async (req) => {
  await ws.addRepo(req.params.id, req.body.url, req.body.branch, req.user)
  return ws.getWorkspace(req.params.id)
})
app.post<{ Params: { id: string; name: string } }>('/api/workspaces/:id/repos/:name/clone', async (req) => {
  await ws.cloneMissingRepo(req.params.id, req.params.name, req.user)
  return ws.getWorkspace(req.params.id)
})
app.get<{ Params: { id: string; name: string } }>('/api/workspaces/:id/repos/:name/branches', async (req) =>
  ws.repoBranches(req.params.id, req.params.name, req.user),
)
app.put<{ Params: { id: string; name: string }; Body: { branch: string; create?: boolean } }>('/api/workspaces/:id/repos/:name/branch', async (req) => {
  await ws.switchBranch(req.params.id, req.params.name, req.body.branch ?? '', !!req.body.create, req.user)
  return ws.getWorkspace(req.params.id)
})
app.get<{ Params: { id: string; name: string } }>('/api/workspaces/:id/repos/:name/removal', async (req) => ({
  reasons: await ws.removalBlockers(req.params.id, req.params.name),
}))
app.put<{ Params: { id: string; name: string }; Body: { command: string | null } }>('/api/workspaces/:id/repos/:name/test', async (req) => {
  ws.setTestCommand(req.params.id, req.params.name, req.body.command)
  return ws.getWorkspace(req.params.id)
})
app.get<{ Params: { id: string; name: string } }>('/api/workspaces/:id/repos/:name/env', async (req) => ({
  content: ws.repoEnv(req.params.id, req.params.name),
}))
app.put<{ Params: { id: string; name: string }; Body: { content: string } }>('/api/workspaces/:id/repos/:name/env', async (req) => {
  ws.setRepoEnv(req.params.id, req.params.name, req.body.content ?? '')
  return ws.getWorkspace(req.params.id)
})
app.delete<{ Params: { id: string; name: string } }>('/api/workspaces/:id/repos/:name', async (req) => {
  await ws.removeRepo(req.params.id, req.params.name)
  return ws.getWorkspace(req.params.id)
})

app.get<{ Params: { id: string } }>('/api/workspaces/:id/tickets', async (req) => {
  ws.workspaceRoot(req.params.id)
  return tickets.listTickets(req.params.id)
})
app.post<{ Params: { id: string }; Body: NewTicket }>('/api/workspaces/:id/tickets', async (req) =>
  tickets.createTicket(req.params.id, req.body, req.user),
)
app.get<{ Params: { id: string } }>('/api/tickets/:id', async (req) => tickets.getTicketDetail(req.params.id))
app.post<{ Params: { id: string }; Body: { text: string; images?: string[] } }>('/api/tickets/:id/messages', async (req) => {
  tickets.sendMessage(req.params.id, req.body.text, req.body.images)
  return tickets.getTicket(req.params.id)
})
app.post<{ Params: { id: string } }>('/api/tickets/:id/stop', async (req) => {
  await tickets.stopTicket(req.params.id)
  return tickets.getTicket(req.params.id)
})
app.post<{ Params: { id: string }; Body: { on: boolean } }>('/api/tickets/:id/autonomous', async (req) => {
  return tickets.setAutonomous(req.params.id, !!req.body?.on)
})
app.get<{ Params: { id: string } }>('/api/tickets/:id/docs', async (req) => tickets.getDocs(req.params.id))
app.put<{ Params: { id: string; stage: DocStage }; Body: { content: string } }>('/api/tickets/:id/docs/:stage', async (req) => {
  tickets.editDoc(req.params.id, req.params.stage, req.body.content)
  return tickets.getDocs(req.params.id)
})
app.post<{ Params: { id: string }; Body: { stage: DocStage } }>('/api/tickets/:id/approve', async (req) => {
  await tickets.approveDoc(req.params.id, req.body.stage)
  return tickets.getTicket(req.params.id)
})
app.get<{ Params: { id: string } }>('/api/tickets/:id/diff', async (req) => tickets.getDiff(req.params.id))
app.get<{ Params: { id: string } }>('/api/tickets/:id/commit', async (req) => ({ message: tickets.suggestedCommit(req.params.id) }))
app.post<{ Params: { id: string }; Body: { message: string } }>('/api/tickets/:id/commit', async (req) => {
  await tickets.commitTicket(req.params.id, req.body.message, req.user)
  return tickets.getDiff(req.params.id)
})
app.post<{ Params: { id: string } }>('/api/tickets/:id/pr', async (req) => {
  await tickets.openPrs(req.params.id, req.user)
  return tickets.getDiff(req.params.id)
})
app.post<{ Params: { id: string }; Body: { discard?: boolean } }>('/api/tickets/:id/close', async (req) => {
  await tickets.closeTicket(req.params.id, !!req.body?.discard)
  return tickets.getTicket(req.params.id)
})
app.post<{ Params: { id: string } }>('/api/tickets/:id/tests', async (req) => {
  tests.runTests(req.params.id)
  return { ok: true }
})
app.get<{ Params: { id: string } }>('/api/tickets/:id/tests/warnings', (req) => tests.testWarnings(req.params.id))
app.post<{ Params: { id: string; run: string } }>('/api/tickets/:id/tests/:run/send', async (req) => {
  tests.sendFailure(req.params.id, Number(req.params.run))
  return { ok: true }
})
app.post<{ Params: { id: string } }>('/api/tickets/:id/tests/stop', async (req) => {
  tests.stopTests(req.params.id)
  return { ok: true }
})
app.post<{ Params: { id: string; askId: string }; Body: Reply }>('/api/tickets/:id/asks/:askId', async (req) => {
  tickets.answerAsk(req.params.id, req.params.askId, req.body)
  return tickets.getTicket(req.params.id)
})

app.get<{ Params: { id: string } }>('/api/workspaces/:id/improvements', async (req) => improvements.listImprovements(req.params.id))
app.post<{ Params: { id: string }; Body: NewImprovement }>('/api/workspaces/:id/improvements', async (req) =>
  improvements.createImprovement(req.params.id, req.body ?? { title: '' }, req.user.id),
)
app.get<{ Params: { id: string } }>('/api/workspaces/:id/improvements/import', async (req) => improvements.importPreview(req.params.id))
app.post<{ Params: { id: string }; Body: { text: string; dryRun?: boolean } }>('/api/workspaces/:id/improvements/import', async (req) =>
  improvements.importMarkdown(req.params.id, req.body?.text ?? '', req.user, !!req.body?.dryRun),
)
app.put<{ Params: { id: string; itemId: string }; Body: ImprovementPatch }>('/api/workspaces/:id/improvements/:itemId', async (req) =>
  improvements.updateImprovement(req.params.id, req.params.itemId, req.body ?? {}),
)
app.delete<{ Params: { id: string; itemId: string } }>('/api/workspaces/:id/improvements/:itemId', async (req) => {
  improvements.deleteImprovement(req.params.id, req.params.itemId)
  return { ok: true }
})

// A imagem vai em base64 no JSON; 5 MB viram cerca de 6,7 MB.
app.post<{ Body: { mediaType: string; data: string } }>('/api/images', { bodyLimit: 8 * 1024 * 1024 }, async (req): Promise<UploadedImage> => ({
  id: images.saveImage(req.body?.mediaType, req.body?.data),
}))
// O id não muda de conteúdo, então o navegador pode guardar.
app.get<{ Params: { id: string } }>('/api/images/:id', async (req, reply) => {
  const file = images.imagePath(req.params.id)
  return reply.type(images.mediaTypeOf(req.params.id)).header('cache-control', 'private, max-age=31536000, immutable').send(fs.createReadStream(file))
})

app.get<{ Params: { id: string } }>('/api/workspaces/:id/conversations', async (req) => conversations.listConversations(req.params.id))
app.post<{ Params: { id: string }; Body: NewConversation }>('/api/workspaces/:id/conversations', async (req) =>
  conversations.createConversation(req.params.id, req.body ?? {}, req.user),
)
app.post<{ Params: { id: string }; Body: { text: string; images?: string[] } }>('/api/conversations/:id/messages', async (req) => {
  conversations.sendMessage(req.params.id, req.body?.text, req.user, req.body?.images)
  return { ok: true }
})
app.post<{ Params: { id: string } }>('/api/conversations/:id/stop', async (req) => {
  await conversations.stopConversation(req.params.id)
  return { ok: true }
})
app.post<{ Params: { id: string; pid: string }; Body: { ticket?: NewTicket } }>('/api/conversations/:id/proposals/:pid', async (req) => ({
  ticketId: await conversations.resolveProposal(req.params.id, req.params.pid, req.body?.ticket ?? null, req.user),
}))
app.delete<{ Params: { id: string } }>('/api/conversations/:id', async (req) => {
  await conversations.deleteConversation(req.params.id, req.user)
  return { ok: true }
})
app.get<{ Params: { id: string } }>('/ws/conversations/:id', { websocket: true }, (socket, req) => {
  const send = (m: WsMessage) => socket.send(JSON.stringify(m))
  let conversation
  try {
    conversation = conversations.getConversation(req.params.id)
  } catch {
    return socket.close(4404, 'Conversa não encontrada')
  }
  send({ kind: 'conversation', conversation })
  for (const event of conversations.listEvents(conversation.id)) send({ kind: 'event', event })
  const off = tickets.subscribe(conversation.id, send)
  socket.on('close', off)
})

// Manda o histórico gravado e depois os eventos novos. Tudo no mesmo tick,
// então nenhum evento cai entre a leitura do banco e a inscrição.
app.get<{ Params: { id: string } }>('/ws/tickets/:id', { websocket: true }, (socket, req) => {
  const send = (m: WsMessage) => socket.send(JSON.stringify(m))
  let ticket
  try {
    ticket = tickets.getTicket(req.params.id)
  } catch {
    return socket.close(4404, 'Ticket não encontrado')
  }
  send({ kind: 'ticket', ticket })
  for (const event of tickets.listEvents(ticket.id)) send({ kind: 'event', event })
  for (const run of tests.listRuns(ticket.id)) send({ kind: 'test', run })
  const off = tickets.subscribe(ticket.id, send)
  socket.on('close', off)
})

// ?ticket=STU-N abre na pasta da tarefa; ?workspace=&demanda= abre na raiz do workspace.
// O listener de mensagens entra antes do await: o que chegar enquanto o terminal abre não se perde.
app.get<{ Querystring: { ticket?: string; workspace?: string; demanda?: string; cols?: string; rows?: string } }>('/ws/terminal', { websocket: true }, async (socket, req) => {
  const send = (m: TerminalOut) => socket.readyState === socket.OPEN && socket.send(JSON.stringify(m))
  const size = { cols: Number(req.query.cols) || 120, rows: Number(req.query.rows) || 32 }
  let key: string | null = null
  const early: TerminalIn[] = []
  const handle = (m: TerminalIn) => {
    if (m.type === 'input') terminals.write(key!, m.data)
    else if (m.type === 'resize') terminals.resize(key!, m)
    else if (m.type === 'kill') terminals.kill(key!)
  }
  socket.on('message', (raw: Buffer) => {
    let m: TerminalIn
    try {
      m = JSON.parse(String(raw))
    } catch {
      return
    }
    if (key) handle(m)
    else early.push(m)
  })
  let off = () => {}
  socket.on('close', () => off())
  try {
    const { ticket, workspace, demanda } = req.query
    if (ticket) key = tickets.ticketTerminal(ticket, size)
    else if (workspace && demanda) key = await terminals.rootTerminal(workspace, demanda, req.user, size)
    else throw new HttpError(400, 'Diga o ticket ou o workspace e a demanda')
  } catch (err) {
    send({ type: 'error', message: err instanceof Error ? err.message : 'Falha ao abrir o terminal' })
    return socket.close()
  }
  if (socket.readyState !== socket.OPEN) return
  off = terminals.attach(key, send, size)
  for (const m of early) handle(m)
})

// No app do Mac não há Caddy: o próprio daemon entrega a tela já compilada.
const UI_DIR = process.env.STUDIO_UI_DIR
if (UI_DIR) {
  const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json' }
  app.get('/*', async (req, reply) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/ws/')) throw new HttpError(404, 'Não encontrado')
    const rel = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '')
    let file = path.join(UI_DIR, rel)
    // Rotas da tela (ex.: /demandas/891) caem no index.html.
    if (!file.startsWith(UI_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(UI_DIR, 'index.html')
    const html = file.endsWith('.html')
    reply.header('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream').header('cache-control', html ? 'no-cache' : 'public, max-age=31536000, immutable')
    return reply.send(fs.createReadStream(file))
  })
}

// Só localhost: o daemon roda comandos na máquina; expor fica para a instalação em servidor.
if (CONTAINERS) {
  console.log(`Preparando a imagem do agente (${IMAGE})…`)
  await ensureImage()
}
await app.listen({ port: PORT, host: HOST })
startBackups()
openproject.startNotificationPolling()
