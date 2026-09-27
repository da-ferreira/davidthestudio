import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ContextFiles, ImportResult, Manifest, ManifestRepo, RepoStatus, User, Workspace, WorkspaceDetail } from '@studio/shared'
import { gitEnv } from './connections.ts'
import { deleteConversations } from './conversations.ts'
import { DATA_DIR, db } from './db.ts'
import * as g from './git.ts'
import { HttpError } from './http-error.ts'
import { suggestTest } from './node-deps.ts'
import { open, seal } from './secrets.ts'
import { deleteTickets, openTickets, ticketsUsingRepo } from './tickets.ts'

type Row = { id: string; name: string; path: string }

const MANIFEST = 'workspace.json'
const ENV = '.env'

function readManifest(dir: string): Manifest | null {
  const file = path.join(dir, MANIFEST)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeManifest(dir: string, m: Manifest) {
  fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(m, null, 2) + '\n')
}

function getRow(id: string): Row {
  const row = db.prepare('SELECT id, name, path FROM workspaces WHERE id = ?').get(id) as Row | undefined
  if (!row) throw new HttpError(404, 'Workspace não encontrado')
  return row
}

function manifestOf(row: Row): Manifest {
  return readManifest(row.path) ?? { name: row.name, repos: [] }
}

// Atualiza o remote. A branch base e o comando de teste só são preenchidos se nunca foram
// definidos: a base pode ter sido escolhida no clone ou trocada pela tela.
async function describeRepo(dir: string, prev: Partial<ManifestRepo> & { name: string }): Promise<ManifestRepo> {
  const test = prev.test !== undefined ? prev.test : suggestTest(dir)
  return { ...prev, remote: await g.remoteUrl(dir), defaultBranch: prev.defaultBranch || (await g.defaultBranch(dir)), test }
}

function uniqueId(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'
  let id = base
  for (let n = 2; db.prepare('SELECT 1 FROM workspaces WHERE id = ?').get(id); n++) id = `${base}-${n}`
  return id
}

export function workspaceRoot(id: string): string {
  return getRow(id).path
}

export function workspaceRepos(id: string): ManifestRepo[] {
  return manifestOf(getRow(id)).repos
}

export function listWorkspaces(): Workspace[] {
  const rows = db.prepare('SELECT id, name, path FROM workspaces ORDER BY name').all() as Row[]
  return rows.map((r) => ({ ...r, repoCount: manifestOf(r).repos.length }))
}

export async function registerWorkspace(input: string): Promise<Workspace> {
  const dir = path.resolve(input.trim().replace(/^~(?=$|\/)/, os.homedir()))
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new HttpError(400, `Pasta não encontrada: ${dir}`)
  if (db.prepare('SELECT 1 FROM workspaces WHERE path = ?').get(dir)) throw new HttpError(409, 'Essa pasta já está registrada')

  const manifest = await scan(dir, readManifest(dir) ?? { name: path.basename(dir), repos: [] })

  const ws = { id: uniqueId(manifest.name), name: manifest.name, path: dir }
  db.prepare('INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)').run(ws.id, ws.name, ws.path)
  return { ...ws, repoCount: manifest.repos.length }
}

// Pasta de destino dos workspaces importados por URL ou criados vazios; os registrados por caminho ficam onde estão.
const IMPORT_DIR = path.join(DATA_DIR, 'workspaces')

export async function createEmptyWorkspace(input: string): Promise<Workspace> {
  const name = input.trim()
  const folder = name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '')
  if (!folder) throw new HttpError(400, 'Dê um nome ao workspace')
  const dir = path.join(IMPORT_DIR, folder)
  if (fs.existsSync(dir)) throw new HttpError(409, `Já existe a pasta ${dir}`)
  fs.mkdirSync(dir, { recursive: true })
  writeManifest(dir, { name, repos: [] })
  return registerWorkspace(dir)
}

function nameFromUrl(url: string): string {
  const name = url.trim().replace(/\/+$/, '').split(/[/:]/).pop()?.replace(/\.git$/, '')
  if (!name || !/^[\w.-]+$/.test(name) || name === '..' || name === '.') throw new HttpError(400, 'URL inválida')
  return name
}

async function cloneInto(url: string, parent: string, name: string, env: Record<string, string>, branch?: string) {
  try {
    await g.clone(url.trim(), parent, name, env, branch)
  } catch (err) {
    fs.rmSync(path.join(parent, name), { recursive: true, force: true })
    throw new HttpError(400, (err as { stderr?: string }).stderr?.trim() || 'Falha no git clone')
  }
}

// Clona o repositório de contexto e cada repo do workspace.json. Repo que falha fica
// ausente no manifesto e pode ser clonado depois pela tela de repositórios.
export async function importWorkspace(url: string, user: User): Promise<ImportResult> {
  const name = nameFromUrl(url)
  const dir = path.join(IMPORT_DIR, name)
  if (fs.existsSync(dir)) throw new HttpError(409, `Já existe a pasta ${dir}`)
  const env = gitEnv(user)
  fs.mkdirSync(IMPORT_DIR, { recursive: true })
  await cloneInto(url, IMPORT_DIR, name, env)

  try {
    const failed: ImportResult['failed'] = []
    for (const r of readManifest(dir)?.repos ?? []) {
      if (fs.existsSync(path.join(dir, r.name))) continue
      if (!r.remote) {
        failed.push({ name: r.name, error: 'sem remote no workspace.json' })
        continue
      }
      try {
        await cloneInto(r.remote, dir, r.name, env, r.defaultBranch)
      } catch (err) {
        failed.push({ name: r.name, error: (err as Error).message })
      }
    }
    return { workspace: await registerWorkspace(dir), failed }
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true })
    throw err instanceof SyntaxError ? new HttpError(400, 'O workspace.json do repositório não é um JSON válido') : err
  }
}

export async function cloneMissingRepo(id: string, name: string, user: User) {
  const row = getRow(id)
  const manifest = manifestOf(row)
  const i = manifest.repos.findIndex((r) => r.name === name)
  const repo = manifest.repos[i]
  if (!repo) throw new HttpError(404, 'Repositório não encontrado')
  if (fs.existsSync(path.join(row.path, name))) throw new HttpError(409, `A pasta ${name} já existe no workspace`)
  if (!repo.remote) throw new HttpError(400, 'O repositório não tem remote no workspace.json')
  await cloneInto(repo.remote, row.path, name, gitEnv(user), repo.defaultBranch)
  manifest.repos[i] = await describeRepo(path.join(row.path, name), repo)
  writeManifest(row.path, manifest)
}

// Acrescenta repos novos na pasta e atualiza remote/branch dos que existem. Repo que
// sumiu do disco continua no manifesto (aparece como ausente): pode só não ter sido clonado aqui.
async function scan(dir: string, manifest: Manifest): Promise<Manifest> {
  const known = new Set(manifest.repos.map((r) => r.name))
  const found = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !known.has(e.name) && fs.existsSync(path.join(dir, e.name, '.git')))
    .map((e) => e.name)
    .sort()
  const repos = await Promise.all(
    manifest.repos.map((r) => (fs.existsSync(path.join(dir, r.name, '.git')) ? describeRepo(path.join(dir, r.name), r) : r)),
  )
  for (const name of found) repos.push(await describeRepo(path.join(dir, name), { name }))
  const next = { ...manifest, repos }
  writeManifest(dir, next)
  return next
}

export async function rescanWorkspace(id: string) {
  const row = getRow(id)
  await scan(row.path, manifestOf(row))
}

// Só tira o workspace do studio: a pasta e os repos ficam no disco.
export async function removeWorkspace(id: string) {
  getRow(id)
  const open = openTickets(id)
  if (open.length) throw new HttpError(409, 'Há tickets abertos neste workspace', open.map((t) => `${t} ainda tem worktrees; encerre ou descarte antes`))
  await deleteConversations(id)
  deleteTickets(id)
  db.prepare('DELETE FROM repo_envs WHERE workspace_id = ?').run(id)
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
}

const AGENTS = 'AGENTS.md'
const CLAUDE = 'CLAUDE.md'
const IMPORT = '@AGENTS.md\n'

function readIf(file: string) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
}

export const isUnified = (dir: string) => contextFiles(dir) === 'unified'

function contextFiles(dir: string): ContextFiles {
  const claude = readIf(path.join(dir, CLAUDE))
  const agents = readIf(path.join(dir, AGENTS))
  if (claude !== null && claude.trim() === IMPORT.trim()) return 'unified'
  if (claude !== null && agents !== null) return 'both'
  return claude !== null ? 'claude' : agents !== null ? 'agents' : 'none'
}

// O Codex lê AGENTS.md e o Claude lê CLAUDE.md. O conteúdo passa para o AGENTS.md
// e o CLAUDE.md vira só o import, para os dois agentes lerem o mesmo contexto.
export function unifyContext(id: string) {
  const dir = getRow(id).path
  const state = contextFiles(dir)
  if (state === 'both') throw new HttpError(409, 'CLAUDE.md e AGENTS.md têm conteúdos diferentes; junte os dois à mão antes')
  if (state === 'unified' || state === 'none') return
  if (state === 'claude') fs.renameSync(path.join(dir, CLAUDE), path.join(dir, AGENTS))
  fs.writeFileSync(path.join(dir, CLAUDE), IMPORT)
}

export async function getWorkspace(id: string): Promise<WorkspaceDetail> {
  const row = getRow(id)
  const manifest = manifestOf(row)
  const repos = await Promise.all(manifest.repos.map((r) => repoStatus(row.id, row.path, r)))
  return { ...row, repoCount: repos.length, repos, context: contextFiles(row.path) }
}

async function repoStatus(id: string, root: string, repo: ManifestRepo): Promise<RepoStatus> {
  const dir = path.join(root, repo.name)
  if (!fs.existsSync(path.join(dir, '.git'))) return { ...repo, present: false, branch: null, changes: 0, unpushed: [], hasEnv: false }
  const [branch, changes, unpushed] = await Promise.all([g.currentBranch(dir), g.changedFiles(dir), g.unpushedBranches(dir)])
  return { ...repo, present: true, branch, changes, unpushed, hasEnv: !!storedEnv(id, repo.name, dir) }
}

export async function addRepo(id: string, url: string, branch: string | undefined, user: User): Promise<void> {
  const row = getRow(id)
  const name = nameFromUrl(url)
  const manifest = manifestOf(row)
  if (manifest.repos.some((r) => r.name === name) || fs.existsSync(path.join(row.path, name))) {
    throw new HttpError(409, `Já existe "${name}" neste workspace`)
  }
  const base = branch?.trim() || undefined
  await cloneInto(url, row.path, name, gitEnv(user), base)
  manifest.repos.push(await describeRepo(path.join(row.path, name), { name, defaultBranch: base }))
  writeManifest(row.path, manifest)
}

export async function repoBranches(id: string, name: string, user: User): Promise<string[]> {
  const { repo, dir } = presentRepo(id, name)
  if (repo.remote) await fetchOrigin(dir, user)
  return g.branches(dir)
}

async function fetchOrigin(dir: string, user: User) {
  try {
    await g.git(dir, ['fetch', '--prune', 'origin'], gitEnv(user))
  } catch (err) {
    throw new HttpError(400, (err as { stderr?: string }).stderr?.trim() || 'Falha no git fetch')
  }
}

// Troca a branch base do repo: tickets e conversas novos saem dela e os PRs apontam para ela.
// Com create, cria a branch a partir da atual e sobe para o origin, para o PR ter onde apontar.
export async function switchBranch(id: string, name: string, input: string, create: boolean, user: User): Promise<void> {
  const { row, manifest, repo, dir } = presentRepo(id, name)
  const branch = input.trim()
  if (!branch || branch.startsWith('-')) throw new HttpError(400, 'Nome de branch inválido')
  await g.git(dir, ['check-ref-format', '--branch', branch]).catch(() => {
    throw new HttpError(400, `Nome de branch inválido: ${branch}`)
  })
  // Ticket aberto compara o diff e abre o PR contra a base; trocar no meio bagunçaria os dois.
  const tickets = ticketsUsingRepo(id, name)
  if (tickets.length) throw new HttpError(409, 'Há tickets usando este repositório', tickets.map((t) => `${t} ainda tem worktree; encerre ou descarte antes`))
  const changes = await g.changedFiles(dir)
  if (changes) throw new HttpError(409, `O repositório tem ${changes} arquivo(s) com mudanças não commitadas`)
  if (repo.remote) await fetchOrigin(dir, user)

  const known = await g.branches(dir)
  if (create) {
    if (known.includes(branch)) throw new HttpError(409, `A branch ${branch} já existe`)
    const previous = await g.currentBranch(dir)
    await g.git(dir, ['checkout', '-q', '-b', branch])
    if (repo.remote) {
      try {
        await g.git(dir, ['push', '-q', '-u', 'origin', branch], gitEnv(user))
      } catch (err) {
        if (previous) await g.git(dir, ['checkout', '-q', previous])
        await g.git(dir, ['branch', '-D', branch]).catch(() => {})
        throw new HttpError(400, (err as { stderr?: string }).stderr?.trim() || 'Falha no git push')
      }
    }
  } else {
    if (!known.includes(branch)) throw new HttpError(404, `A branch ${branch} não existe`)
    try {
      await g.git(dir, ['checkout', '-q', branch])
      const upstream = await g.git(dir, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]).catch(() => null)
      if (upstream) await g.git(dir, ['merge', '-q', '--ff-only', `origin/${branch}`])
    } catch (err) {
      throw new HttpError(400, (err as { stderr?: string }).stderr?.trim() || 'Falha ao trocar de branch')
    }
  }
  repo.defaultBranch = branch
  writeManifest(row.path, manifest)
}

// O que se perderia ao apagar a pasta do repo. Lista vazia = seguro remover.
export async function removalBlockers(id: string, name: string): Promise<string[]> {
  const row = getRow(id)
  const dir = path.join(row.path, name)
  const reasons = ticketsUsingRepo(id, name).map((t) => `ticket ${t} tem uma worktree deste repositório`)
  if (!fs.existsSync(path.join(dir, '.git'))) return reasons
  const changes = await g.changedFiles(dir)
  if (changes) reasons.push(`${changes} arquivo(s) com mudanças não commitadas`)
  for (const b of await g.unpushedBranches(dir)) reasons.push(`branch ${b} com commits sem push`)
  const stashes = await g.stashCount(dir)
  if (stashes) reasons.push(`${stashes} stash(es) guardado(s)`)
  return reasons
}

export async function removeRepo(id: string, name: string): Promise<void> {
  const row = getRow(id)
  const manifest = manifestOf(row)
  if (!manifest.repos.some((r) => r.name === name)) throw new HttpError(404, 'Repositório não encontrado')
  const reasons = await removalBlockers(id, name)
  if (reasons.length) throw new HttpError(409, 'O repositório tem trabalho que seria perdido', reasons)
  fs.rmSync(path.join(row.path, name), { recursive: true, force: true })
  db.prepare('DELETE FROM repo_envs WHERE workspace_id = ? AND repo = ?').run(id, name)
  manifest.repos = manifest.repos.filter((r) => r.name !== name)
  writeManifest(row.path, manifest)
}

function presentRepo(id: string, name: string) {
  const row = getRow(id)
  const manifest = manifestOf(row)
  const repo = manifest.repos.find((r) => r.name === name)
  const dir = path.join(row.path, name)
  if (!repo || !fs.existsSync(path.join(dir, '.git'))) throw new HttpError(404, 'Repositório não encontrado')
  return { row, manifest, repo, dir }
}

export function setTestCommand(id: string, name: string, command: string | null) {
  const { row, manifest, repo } = presentRepo(id, name)
  repo.test = command?.trim() || null
  writeManifest(row.path, manifest)
}


// O .env do studio fica criptografado no banco. Um .env que já existia no repo entra na
// primeira leitura; o arquivo fica onde está, porque pode ser o do desenvolvimento local.
function storedEnv(id: string, name: string, dir: string): string | null {
  const row = db.prepare('SELECT content FROM repo_envs WHERE workspace_id = ? AND repo = ?').get(id, name) as { content: string } | undefined
  if (row) return open(row.content) || null
  const file = readIf(path.join(dir, ENV))
  if (file === null) return null
  saveEnv(id, name, file)
  return file || null
}

function saveEnv(id: string, name: string, content: string) {
  db.prepare('INSERT OR REPLACE INTO repo_envs (workspace_id, repo, content) VALUES (?, ?, ?)').run(id, name, seal(content))
}

export function repoEnv(id: string, name: string): string | null {
  return storedEnv(id, name, presentRepo(id, name).dir)
}

// Só o executor de testes usa, injetando no processo do teste; o agente não vê.
// Apagar grava vazio em vez de remover, para o .env antigo do repo não voltar na próxima leitura.
export function setRepoEnv(id: string, name: string, content: string) {
  presentRepo(id, name)
  saveEnv(id, name, !content.trim() ? '' : content.endsWith('\n') ? content : content + '\n')
}
