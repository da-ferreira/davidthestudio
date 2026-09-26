import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Manifest, ManifestRepo, RepoStatus, Workspace, WorkspaceDetail } from '@studio/shared'
import { db } from './db.ts'
import * as g from './git.ts'
import { HttpError } from './http-error.ts'
import { ticketsUsingRepo } from './tickets.ts'

type Row = { id: string; name: string; path: string }

const MANIFEST = 'workspace.json'

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

async function describeRepo(dir: string, name: string): Promise<ManifestRepo> {
  return { name, remote: await g.remoteUrl(dir), defaultBranch: await g.defaultBranch(dir) }
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

  const manifest = readManifest(dir) ?? { name: path.basename(dir), repos: [] }
  const known = new Set(manifest.repos.map((r) => r.name))
  const found = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !known.has(e.name) && fs.existsSync(path.join(dir, e.name, '.git')))
    .map((e) => e.name)
    .sort()
  for (const name of found) manifest.repos.push(await describeRepo(path.join(dir, name), name))
  writeManifest(dir, manifest)

  const ws = { id: uniqueId(manifest.name), name: manifest.name, path: dir }
  db.prepare('INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)').run(ws.id, ws.name, ws.path)
  return { ...ws, repoCount: manifest.repos.length }
}

export async function getWorkspace(id: string): Promise<WorkspaceDetail> {
  const row = getRow(id)
  const manifest = manifestOf(row)
  const repos = await Promise.all(manifest.repos.map((r) => repoStatus(row.path, r)))
  return { ...row, repoCount: repos.length, repos }
}

async function repoStatus(root: string, repo: ManifestRepo): Promise<RepoStatus> {
  const dir = path.join(root, repo.name)
  if (!fs.existsSync(path.join(dir, '.git'))) return { ...repo, present: false, branch: null, changes: 0, unpushed: [] }
  const [branch, changes, unpushed] = await Promise.all([g.currentBranch(dir), g.changedFiles(dir), g.unpushedBranches(dir)])
  return { ...repo, present: true, branch, changes, unpushed }
}

export async function addRepo(id: string, url: string): Promise<void> {
  const row = getRow(id)
  const name = url.trim().replace(/\/+$/, '').split(/[/:]/).pop()?.replace(/\.git$/, '')
  if (!name || !/^[\w.-]+$/.test(name) || name === '..') throw new HttpError(400, 'URL inválida')
  const manifest = manifestOf(row)
  if (manifest.repos.some((r) => r.name === name) || fs.existsSync(path.join(row.path, name))) {
    throw new HttpError(409, `Já existe "${name}" neste workspace`)
  }
  try {
    await g.clone(url.trim(), row.path, name)
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr?.trim()
    throw new HttpError(400, stderr || 'Falha no git clone')
  }
  manifest.repos.push(await describeRepo(path.join(row.path, name), name))
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
  manifest.repos = manifest.repos.filter((r) => r.name !== name)
  writeManifest(row.path, manifest)
}
