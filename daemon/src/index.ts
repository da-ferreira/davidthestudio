import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import type { ApiError, Health, NewTicket, WsMessage } from '@studio/shared'
import { HttpError } from './http-error.ts'
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

app.get('/api/workspaces', async () => ws.listWorkspaces())
app.post<{ Body: { path: string } }>('/api/workspaces', async (req) => ws.registerWorkspace(req.body.path))
app.get<{ Params: { id: string } }>('/api/workspaces/:id', async (req) => ws.getWorkspace(req.params.id))

app.post<{ Params: { id: string }; Body: { url: string } }>('/api/workspaces/:id/repos', async (req) => {
  await ws.addRepo(req.params.id, req.body.url)
  return ws.getWorkspace(req.params.id)
})
app.get<{ Params: { id: string; name: string } }>('/api/workspaces/:id/repos/:name/removal', async (req) => ({
  reasons: await ws.removalBlockers(req.params.id, req.params.name),
}))
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
  const off = tickets.subscribe(ticket.id, send)
  socket.on('close', off)
})

// Só localhost: o daemon roda comandos na máquina e ainda não tem login.
await app.listen({ port: PORT, host: '127.0.0.1' })
