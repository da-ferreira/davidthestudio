import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { DemandaDetail, NewTutorial, Prompt, Tutorial, TutorialShot, TutorialStatus, User } from '@studio/shared'
import * as claude from './agents/claude.ts'
import { agentStatus, claudeEnv } from './connections.ts'
import { CONTAINERS, containerName, homeMounts } from './containers.ts'
import { DATA_DIR, db } from './db.ts'
import { HttpError } from './http-error.ts'
import { notify } from './notifications.ts'
import { checkImages, imagePath, IMAGES_DIR, MAX_IMAGES, mediaTypeOf } from './images.ts'
import * as openproject from './openproject.ts'

const DIR = path.join(DATA_DIR, 'tutorials')
const MODEL_ID = /^[\w.[\]-]+$/

type Row = {
  num: number
  id: string
  title: string
  prompt: string
  model: string
  demanda: string | null
  context: string
  status: TutorialStatus
  shots: string
  body: string | null
  error: string | null
  created_by: string
  author: string | null
  created_at: string
  updated_at: string
}

const toTutorial = (r: Row): Tutorial => ({
  id: r.id,
  num: r.num,
  title: r.title,
  prompt: r.prompt,
  model: r.model,
  demanda: r.demanda ? JSON.parse(r.demanda) : null,
  status: r.status,
  shots: JSON.parse(r.shots),
  error: r.error,
  ready: !!r.body,
  author: r.author,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

const SELECT = 'SELECT t.*, u.name AS author FROM tutorials t LEFT JOIN users u ON u.id = t.created_by'

// O agente roda dentro do daemon; se ele reiniciou no meio, a etapa precisa rodar de novo.
db.prepare("UPDATE tutorials SET status = 'error', error = 'O studio reiniciou enquanto o agente trabalhava; tente de novo.' WHERE status IN ('planning', 'writing')").run()

const running = new Set<string>()

function getRow(id: string): Row {
  const row = db.prepare(`${SELECT} WHERE t.id = ?`).get(id) as Row | undefined
  if (!row) throw new HttpError(404, 'Tutorial não encontrado')
  return row
}

function update(id: string, fields: Partial<Pick<Row, 'status' | 'shots' | 'body' | 'error' | 'title'>>) {
  const keys = Object.keys(fields) as (keyof typeof fields)[]
  db.prepare(`UPDATE tutorials SET ${keys.map((k) => `${k} = @${k}`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = @id`).run({ ...fields, id })
}

export function listTutorials(): Tutorial[] {
  return (db.prepare(`${SELECT} ORDER BY t.num DESC`).all() as Row[]).map(toTutorial)
}

export function getTutorial(id: string): Tutorial {
  return toTutorial(getRow(id))
}

// O agente não acessa o OpenProject: o texto da demanda vai junto e as imagens dela viram uma nota.
function demandaContext(d: DemandaDetail) {
  const description = d.description.replace(/!\[([^\]]*)\]\(\/api\/demandas\/anexos\/\d+\)/g, (_, alt) => `(imagem na demanda${alt ? `: ${alt}` : ''})`).trim()
  return [`Demanda #${d.id}: ${d.subject}`, description].filter(Boolean).join('\n\n')
}

export async function createTutorial(input: NewTutorial, user: User): Promise<Tutorial> {
  const prompt = input.prompt?.trim() ?? ''
  if (!prompt) throw new HttpError(400, 'Conte o que o tutorial deve ensinar')
  if (!MODEL_ID.test(input.model ?? '')) throw new HttpError(400, 'Modelo inválido')
  if (!(await agentStatus(user, 'claude')).connected) throw new HttpError(400, 'Conecte o Claude Code na tela Conexões antes de criar tutoriais')
  let demanda: { id: string; url: string } | null = null
  let context = ''
  if (input.demanda) {
    const d = await openproject.getDemanda(user, input.demanda)
    demanda = openproject.demandaLink(user, String(d.id))
    context = demandaContext(d)
  }
  const title = input.title?.trim() || prompt.split('\n')[0].slice(0, 80)
  const id = randomUUID()
  db.prepare("INSERT INTO tutorials (id, title, prompt, model, demanda, context, status, shots, created_by) VALUES (?, ?, ?, ?, ?, ?, 'planning', '[]', ?)").run(
    id,
    title,
    prompt,
    input.model,
    demanda && JSON.stringify(demanda),
    context,
    user.id,
  )
  run(getRow(id), 'plan')
  return getTutorial(id)
}

function assertAuthor(r: Row, user: User) {
  if (r.created_by !== user.id) throw new HttpError(403, 'Só quem criou o tutorial pode mexer nele')
}

function assertIdle(r: Row) {
  if (running.has(r.id)) throw new HttpError(409, 'O agente ainda está trabalhando neste tutorial')
}

export function setShot(id: string, index: number, image: string | null, user: User): Tutorial {
  const r = getRow(id)
  assertAuthor(r, user)
  assertIdle(r)
  const shots = JSON.parse(r.shots) as TutorialShot[]
  if (!shots[index]) throw new HttpError(404, 'Print não encontrado')
  shots[index] = { ...shots[index], image: image === null ? null : checkImages([image])[0] }
  update(id, { shots: JSON.stringify(shots) })
  return getTutorial(id)
}

// Sem a lista de prints, o agente começa por ela; com a lista, monta (ou remonta) o tutorial.
export function generate(id: string, user: User): Tutorial {
  const r = getRow(id)
  assertAuthor(r, user)
  assertIdle(r)
  const shots = JSON.parse(r.shots) as TutorialShot[]
  if (shots.length && !shots.some((s) => s.image)) throw new HttpError(400, 'Anexe pelo menos um print')
  run(r, shots.length ? 'write' : 'plan')
  return getTutorial(id)
}

// Ajuste por texto sobre a versão atual: o agente reescreve só o que foi pedido.
export function adjust(id: string, request: string, user: User): Tutorial {
  const r = getRow(id)
  assertAuthor(r, user)
  assertIdle(r)
  const text = request?.trim() ?? ''
  if (!text) throw new HttpError(400, 'Diga o que ajustar')
  if (!r.body) throw new HttpError(409, 'Monte o tutorial antes de pedir ajuste')
  run(r, 'write', text)
  return getTutorial(id)
}

export function deleteTutorial(id: string, user: User) {
  const r = getRow(id)
  if (r.created_by !== user.id && !user.admin) throw new HttpError(403, 'Só quem criou o tutorial ou o administrador pode apagar')
  assertIdle(r)
  fs.rmSync(path.join(DIR, id), { recursive: true, force: true })
  db.prepare('DELETE FROM tutorials WHERE id = ?').run(id)
}

const PLAN = [
  'Você ajuda a montar tutoriais passo a passo, em português do Brasil, para pessoas que vão usar um sistema.',
  'Nesta etapa você ainda não escreve o tutorial: diga quais prints de tela precisa para ilustrá-lo.',
  'Peça só os prints que a pessoa precisa ver para não se perder: um por tela nova ou ação que não dá para explicar só com texto. Passos simples ("clique em Salvar") não precisam de print. Um tutorial curto pode ter 1 ou 2.',
  `Na ordem em que aparecem no tutorial, nunca mais de ${MAX_IMAGES} (limite de envio, não meta). Cada item diz exatamente qual tela capturar e em que estado (ex.: "Tela de login com e-mail e senha preenchidos, antes de clicar em Entrar").`,
  'Responda só com um array JSON de strings, sem texto antes ou depois.',
].join('\n')

const WRITE = [
  'Você monta tutoriais passo a passo, em português do Brasil, para pessoas que vão usar um sistema.',
  'Escreva o tutorial em HTML: só o conteúdo, sem <html>, <head>, <body>, <h1> (o título já vai no topo), <style>, <script>, classes ou estilos.',
  'Use h2 para as etapas, p, ol, ul, li, strong, em, code, blockquote e table quando ajudar. Texto curto e direto, falando com a pessoa ("clique em", "preencha").',
  'Para mostrar um print, use <figure><img src="print-N" alt="descrição"><figcaption>legenda curta</figcaption></figure>, onde N é o número do print. Use cada print no máximo uma vez e não invente prints que não foram enviados.',
  'Responda só com o HTML, sem texto antes ou depois.',
].join('\n')

const tell = (r: Row, what: string) => notify(r.created_by, { source: 'studio', title: `Tutorial ${what}`, body: r.title, link: `/tutoriais/${r.id}` })

async function run(r: Row, step: 'plan' | 'write', adjustment?: string) {
  running.add(r.id)
  update(r.id, { status: step === 'plan' ? 'planning' : 'writing', error: null })
  try {
    const shots = JSON.parse(r.shots) as TutorialShot[]
    const sent = shots.map((s, i) => ({ ...s, n: i + 1 })).filter((s) => s.image)
    const parts = [`O que o tutorial deve ensinar:\n${r.prompt}`, r.context && `Contexto (demanda no OpenProject):\n${r.context}`]
    if (step === 'write') parts.push(`Prints enviados, na mesma ordem das imagens anexadas:\n${sent.map((s) => `print-${s.n}: ${s.description}`).join('\n')}`)
    if (adjustment) parts.push(`Versão atual do tutorial:\n${r.body}`, `Ajuste pedido (mude só isso e mantenha o resto como está):\n${adjustment}`)
    const prompt: Prompt = { text: parts.filter(Boolean).join('\n\n'), images: step === 'write' ? sent.map((s) => s.image!) : [] }
    const text = await ask(r, prompt, step === 'plan' ? PLAN : WRITE)
    if (step === 'plan') {
      const list = parseList(text)
      update(r.id, { status: 'shots', shots: JSON.stringify(list.map((description) => ({ description, image: null }))) })
      tell(r, `o agente pediu ${list.length} ${list.length > 1 ? 'prints' : 'print'}`)
    } else {
      update(r.id, { status: 'done', body: cleanBody(text) })
      tell(r, adjustment ? 'ajuste pronto' : 'está pronto')
    }
  } catch (err) {
    update(r.id, { status: 'error', error: String((err as Error)?.message ?? err) })
    tell(r, 'parou com erro')
  } finally {
    running.delete(r.id)
  }
}

// Uma pergunta, uma resposta: junta o texto do agente até o resultado.
async function ask(r: Row, prompt: Prompt, instructions: string): Promise<string> {
  const dir = path.join(DIR, r.id)
  fs.mkdirSync(dir, { recursive: true })
  const owner = db.prepare('SELECT id, admin FROM users WHERE id = ?').get(r.created_by) as { id: string; admin: number }
  const env = claudeEnv({ id: owner.id, admin: !!owner.admin })
  const texts: string[] = []
  let failure: string | null = null
  const session = claude.start({
    cwd: dir,
    prompt,
    model: r.model,
    instructions,
    readOnly: true,
    env,
    container: CONTAINERS ? { name: containerName('tutorial', r.id), mounts: [{ path: dir }, ...homeMounts(env), { path: IMAGES_DIR, readOnly: true }] } : undefined,
    onEvent: (e) => {
      if (e.type === 'text') texts.push(e.text)
      if (e.type === 'result' && !e.ok) failure = e.error ?? 'O agente não terminou'
    },
  })
  await session.done
  if (failure) throw new Error(failure)
  const text = texts.join('\n').trim()
  if (!text) throw new Error('O agente não respondeu')
  return text
}

function parseList(text: string): string[] {
  const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
  let list: unknown
  try {
    list = JSON.parse(json)
  } catch {
    throw new Error('O agente não devolveu a lista de prints; tente de novo.')
  }
  if (!Array.isArray(list) || !list.length || list.some((s) => typeof s !== 'string')) throw new Error('O agente não devolveu a lista de prints; tente de novo.')
  return (list as string[]).slice(0, MAX_IMAGES)
}

// O documento é baixado e aberto fora do studio: sai sem script nem handlers, mesmo se o agente puser.
function cleanBody(text: string) {
  const fenced = text.match(/```(?:html)?\s*\n([\s\S]*?)```/)
  return (fenced ? fenced[1] : text)
    .replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, '')
    .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .trim()
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const CSS = `
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#0a0a0a;font:15px/1.65 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:48px 32px 64px}
h1{font-size:28px;line-height:1.25;letter-spacing:-.02em;margin:0 0 6px}
.sub{color:#737373;font-size:13px;margin:0 0 32px}
h2{font-size:19px;letter-spacing:-.01em;margin:36px 0 10px}
h3{font-size:16px;margin:24px 0 8px}
p,ul,ol,blockquote,table{margin:0 0 14px}
li{margin:4px 0}
a{color:#0a0a0a}
code{font-family:"Geist Mono",ui-monospace,Menlo,monospace;font-size:13px;background:#f5f5f5;border-radius:5px;padding:1px 5px}
blockquote{border-left:3px solid #e5e5e5;padding:2px 0 2px 14px;color:#525252}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{border-bottom:1px solid #efefef;padding:8px 10px;text-align:left}
figure{margin:18px 0 22px}
img{display:block;max-width:100%;height:auto;border:1px solid #e5e5e5;border-radius:10px}
figure,img{break-inside:avoid}
figcaption{color:#737373;font-size:13px;margin-top:8px}
`

// Documento autocontido: as imagens entram embutidas, para abrir offline e mandar para alguém.
export function tutorialDocument(id: string): { html: string; fileName: string; slug: string } {
  const r = getRow(id)
  if (!r.body) throw new HttpError(409, 'O tutorial ainda não foi montado')
  const shots = JSON.parse(r.shots) as TutorialShot[]
  const body = r.body.replace(/<img\b[^>]*>/gi, (tag) => {
    const n = tag.match(/src\s*=\s*["']print-(\d+)["']/i)?.[1]
    const image = n ? shots[Number(n) - 1]?.image : null
    if (!image) return ''
    const data = fs.readFileSync(imagePath(image)).toString('base64')
    return tag.replace(/src\s*=\s*["']print-\d+["']/i, `src="data:${mediaTypeOf(image)};base64,${data}"`)
  })
  const demanda = r.demanda ? (JSON.parse(r.demanda) as { id: string; url: string }) : null
  const sub = demanda ? `<p class="sub">Demanda <a href="${esc(demanda.url)}">#${esc(demanda.id)}</a></p>` : '<p class="sub"></p>'
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>${esc(r.title)}</h1>
${sub}
${body}
</main>
</body>
</html>
`
  const slug = r.title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'tutorial'
  return { html, fileName: `${slug}.html`, slug }
}

// O PDF sai do Electron (o daemon do app roda como filho dele); fora do app não há navegador para gerar.
export const canPdf = () => !!process.send
const pending = new Map<string, { resolve: (pdf: Buffer) => void; reject: (e: Error) => void }>()
process.on('message', (m: { kind?: string; id: string; pdf?: string; error?: string }) => {
  if (m?.kind !== 'pdf') return
  const p = pending.get(m.id)
  pending.delete(m.id)
  if (m.pdf) p?.resolve(Buffer.from(m.pdf, 'base64'))
  else p?.reject(new HttpError(500, m.error ?? 'Não deu para gerar o PDF'))
})

export function tutorialPdf(id: string): Promise<{ pdf: Buffer; fileName: string }> {
  const { html, slug } = tutorialDocument(id)
  if (!canPdf()) throw new HttpError(501, 'O PDF direto só sai no app do Mac')
  const reqId = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(reqId)
      reject(new HttpError(504, 'O PDF demorou demais'))
    }, 60_000)
    pending.set(reqId, {
      resolve: (pdf) => (clearTimeout(timer), resolve({ pdf, fileName: `${slug}.pdf` })),
      reject: (e) => (clearTimeout(timer), reject(e)),
    })
    process.send!({ kind: 'pdf', id: reqId, html })
  })
}

export async function attachToDemanda(id: string, user: User): Promise<DemandaDetail> {
  const r = getRow(id)
  if (!r.demanda) throw new HttpError(400, 'Este tutorial não veio de uma demanda')
  const { html, fileName } = tutorialDocument(id)
  const demanda = JSON.parse(r.demanda) as { id: string }
  const files = []
  if (canPdf()) {
    const { pdf, fileName: pdfName } = await tutorialPdf(id)
    files.push(await openproject.uploadAttachment(user, demanda.id, { fileName: pdfName, contentType: 'application/pdf', data: pdf.toString('base64') }))
  }
  files.push(await openproject.uploadAttachment(user, demanda.id, { fileName, contentType: 'text/html', data: Buffer.from(html).toString('base64') }))
  const list = files.map((f) => `- [${f.fileName}](${f.url})`).join('\n')
  const formats = files.length > 1 ? 'em PDF e em HTML (abre no navegador)' : 'em HTML (abre no navegador)'
  await openproject.addDemandaComment(user, demanda.id, `Segue o tutorial **${r.title}** para esta demanda, ${formats}:\n\n${list}\n\nÉ um guia para orientar, não cobre 100% dos casos. Fique à vontade para fazer ajustes ou passos que não estejam aqui.`)
  return openproject.getDemanda(user, demanda.id)
}
