import Fastify from 'fastify'
import type { Health } from '@studio/shared'

const PORT = Number(process.env.STUDIO_PORT ?? 4700)

const app = Fastify({ logger: { level: 'info' } })

app.get('/api/health', async (): Promise<Health> => ({ ok: true, version: '0.0.0' }))

// Só localhost: o daemon roda comandos na máquina e ainda não tem login.
await app.listen({ port: PORT, host: '127.0.0.1' })
