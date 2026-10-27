import fs from 'node:fs'
import path from 'node:path'
import type { User } from '@studio/shared'
import * as claude from './agents/claude.ts'
import { claudeEnv } from './connections.ts'
import { CONTAINERS, containerName, homeMounts } from './containers.ts'
import { DATA_DIR, db } from './db.ts'
import { HttpError } from './http-error.ts'
import * as openproject from './openproject.ts'

const DIR = path.join(DATA_DIR, 'drafts')

const INSTRUCTIONS = [
  'Você escreve rascunhos de comentário para uma demanda no OpenProject, em português do Brasil, em nome da pessoa que vai revisar e postar.',
  'Use só o que está na demanda, no histórico e nos tickets do studio enviados; não invente andamento, datas nem resultados.',
  'Seja direto e curto, no tom de um colega de trabalho. Markdown simples é permitido.',
  'Responda só com o texto do comentário, sem aspas e sem nada antes ou depois.',
].join('\n')

// Rascunho para a pessoa revisar na tela; nunca é postado daqui.
export async function draftComment(user: User, demandaId: string, hint: string): Promise<string> {
  const d = await openproject.getDemanda(user, demandaId)
  const history = d.activities
    .filter((a) => a.comment || a.details.length)
    .slice(-20)
    .map((a) => `${a.createdAt.slice(0, 10)} ${a.author ?? 'alguém'}: ${a.comment || a.details.join('; ')}`)
  const tickets = db
    .prepare("SELECT id, title, status FROM tickets WHERE json_extract(demanda, '$.id') = ? ORDER BY num")
    .all(String(d.id)) as { id: string; title: string; status: string }[]
  const text = [
    `Demanda #${d.id}: ${d.subject}`,
    `Status: ${d.status?.name ?? '—'}; atribuída a: ${d.assignee?.name ?? '—'}; prazo: ${d.dueDate ?? '—'}`,
    d.description.trim() && `Descrição:\n${d.description.trim()}`,
    history.length && `Histórico (mais antigo primeiro):\n${history.join('\n')}`,
    tickets.length && `Tickets do studio ligados a esta demanda:\n${tickets.map((t) => `${t.id} (${t.status}): ${t.title}`).join('\n')}`,
    `Quem vai postar: ${user.name}`,
    hint.trim() ? `O que o comentário deve dizer (pode ser um rascunho para melhorar):\n${hint.trim()}` : 'Sem orientação: escreva uma atualização curta do andamento com base no histórico.',
  ]
    .filter(Boolean)
    .join('\n\n')

  const dir = path.join(DIR, String(d.id))
  fs.mkdirSync(dir, { recursive: true })
  const env = claudeEnv({ id: user.id, admin: user.admin })
  const texts: string[] = []
  let failure: string | null = null
  const session = claude.start({
    cwd: dir,
    prompt: { text, images: [] },
    model: 'sonnet',
    instructions: INSTRUCTIONS,
    readOnly: true,
    env,
    container: CONTAINERS ? { name: containerName('draft', `${d.id}-${Date.now()}`), mounts: [{ path: dir }, ...homeMounts(env)] } : undefined,
    onEvent: (e) => {
      if (e.type === 'text') texts.push(e.text)
      if (e.type === 'result' && !e.ok) failure = e.error ?? 'O agente não terminou'
    },
  })
  await session.done
  if (failure) throw new HttpError(502, failure)
  const draft = texts.join('\n').trim()
  if (!draft) throw new HttpError(502, 'O agente não respondeu')
  return draft
}
