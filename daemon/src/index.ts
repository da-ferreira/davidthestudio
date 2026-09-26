import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import type { ApiError, DocStage, Health, NewTicket, Reply, WsMessage } from '@studio/shared'
import * as codex from './codex-login.ts'
import { HttpError } from './http-error.ts'
import * as tests from './tests.ts'
import * as tickets from './tickets.ts'
import * as ws from './workspaces.ts'

const PORT = Number(process.env.STUDIO_PORT ?? 4700)

const app = Fastify({ logger: { level: 'info' } })
await app.register(websocket)

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof HttpError) {
    const body: ApiError = { error: err.message, reasons: err.reasons }
    return reply.status(err.status).send(body)
  }
  app.log.error(err)
  return reply.status(500).send({ error: err instanceof Error ? err.message : 'Erro interno' } satisfies ApiError)
})

app.get('/api/health', async (): Promise<Health> => ({ ok: true, version: '0.0.0' }))

app.get('/api/codex', async () => codex.codexStatus())
app.post('/api/codex/login', async () => ({ url: await codex.startChatGptLogin() }))
app.post('/api/codex/login/cancel', async () => {
  codex.cancelLogin()
  return { ok: true }
})
app.post<{ Body: { key: string } }>('/api/codex/api-key', async (req) => {
  await codex.loginWithApiKey(req.body.key)
  return { ok: true }
})
app.post('/api/codex/logout', async () => {
  await codex.logout()
  return { ok: true }
})
app.get('/api/workspaces', async () => ws.listWorkspaces())
app.post<{ Body: { path: string } }>('/api/workspaces', async (req) => ws.registerWorkspace(req.body.path))
app.get<{ Params: { id: string } }>('/api/workspaces/:id', async (req) => ws.getWorkspace(req.params.id))
app.delete<{ Params: { id: string } }>('/api/workspaces/:id', async (req) => {
  ws.removeWorkspace(req.params.id)
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

app.post<{ Params: { id: string }; Body: { url: string } }>('/api/workspaces/:id/repos', async (req) => {
  await ws.addRepo(req.params.id, req.body.url)
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
  await ws.setRepoEnv(req.params.id, req.params.name, req.body.content ?? '')
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
  tickets.createTicket(req.params.id, req.body),
)
app.get<{ Params: { id: string } }>('/api/tickets/:id', async (req) => tickets.getTicketDetail(req.params.id))
app.post<{ Params: { id: string }; Body: { text: string } }>('/api/tickets/:id/messages', async (req) => {
  tickets.sendMessage(req.params.id, req.body.text)
  return tickets.getTicket(req.params.id)
})
app.post<{ Params: { id: string } }>('/api/tickets/:id/stop', async (req) => {
  await tickets.stopTicket(req.params.id)
  return tickets.getTicket(req.params.id)
})
app.get<{ Params: { id: string } }>('/api/tickets/:id/docs', async (req) => tickets.getDocs(req.params.id))
app.put<{ Params: { id: string; stage: DocStage }; Body: { content: string } }>('/api/tickets/:id/docs/:stage', async (req) => {
  tickets.editDoc(req.params.id, req.params.stage, req.body.content)
  return tickets.getDocs(req.params.id)
})
app.post<{ Params: { id: string }; Body: { stage: DocStage } }>('/api/tickets/:id/approve', async (req) => {
  tickets.approveDoc(req.params.id, req.body.stage)
  return tickets.getTicket(req.params.id)
})
app.get<{ Params: { id: string } }>('/api/tickets/:id/diff', async (req) => tickets.getDiff(req.params.id))
app.post<{ Params: { id: string }; Body: { message: string } }>('/api/tickets/:id/commit', async (req) => {
  await tickets.commitTicket(req.params.id, req.body.message)
  return tickets.getDiff(req.params.id)
})
app.post<{ Params: { id: string } }>('/api/tickets/:id/pr', async (req) => {
  await tickets.openPrs(req.params.id)
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

// Só localhost: o daemon roda comandos na máquina e ainda não tem login.
await app.listen({ port: PORT, host: '127.0.0.1' })
