import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { FileChange } from '@studio/shared'

const exec = promisify(execFile)

// Sem prompt de credencial: o daemon não tem terminal, o git travaria esperando.
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }

export async function git(cwd: string, args: string[], extraEnv: Record<string, string> = {}): Promise<string> {
  const { stdout } = await exec('git', args, { cwd, env: { ...env, ...extraEnv }, maxBuffer: 64 * 1024 * 1024 })
  return stdout.trim()
}

async function gitOrNull(cwd: string, args: string[]): Promise<string | null> {
  try {
    return await git(cwd, args)
  } catch {
    return null
  }
}

export function remoteUrl(cwd: string) {
  return gitOrNull(cwd, ['remote', 'get-url', 'origin'])
}

export function currentBranch(cwd: string) {
  return gitOrNull(cwd, ['branch', '--show-current'])
}

export async function defaultBranch(cwd: string): Promise<string> {
  const head = await gitOrNull(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  if (head) return head.replace(/^origin\//, '')
  return (await currentBranch(cwd)) || 'main'
}

export async function changedFiles(cwd: string): Promise<number> {
  const out = await git(cwd, ['status', '--porcelain'])
  return out ? out.split('\n').length : 0
}

// Branches locais com commits que não estão em nenhum remote.
export async function unpushedBranches(cwd: string): Promise<string[]> {
  const branches = (await git(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])).split('\n').filter(Boolean)
  const result: string[] = []
  for (const b of branches) {
    const count = await git(cwd, ['rev-list', '--count', b, '--not', '--remotes'])
    if (count !== '0') result.push(b)
  }
  return result
}

export async function stashCount(cwd: string): Promise<number> {
  const out = await git(cwd, ['stash', 'list'])
  return out ? out.split('\n').length : 0
}

export async function clone(url: string, parent: string, name: string) {
  await exec('git', ['clone', url, name], { cwd: parent, env, maxBuffer: 64 * 1024 * 1024 })
}

export async function addWorktree(repo: string, dir: string, branch: string, base: string) {
  await git(repo, ['worktree', 'add', '-b', branch, dir, base])
}

export async function removeWorktree(repo: string, dir: string) {
  await gitOrNull(repo, ['worktree', 'remove', '--force', dir])
}

export function forkPoint(dir: string, baseBranch: string) {
  return git(dir, ['merge-base', 'HEAD', baseBranch])
}

// Do ponto de partida até o estado atual da worktree, incluindo arquivos novos.
// Usa um index temporário para não mexer no index de verdade.
export async function worktreeDiff(dir: string, base: string): Promise<FileChange[]> {
  const index = path.join(os.tmpdir(), `studio-index-${randomUUID()}`)
  const e = { GIT_INDEX_FILE: index }
  try {
    await git(dir, ['read-tree', 'HEAD'], e)
    await git(dir, ['add', '-A'], e)
    const args = ['diff', '--cached', '--no-renames', base]
    const [numstat, names, patch] = await Promise.all([
      git(dir, [...args, '--numstat'], e),
      git(dir, [...args, '--name-status'], e),
      git(dir, args, e),
    ])
    const patches = new Map<string, string>()
    for (const chunk of patch.split(/^(?=diff --git )/m)) {
      const m = chunk.match(/^diff --git a\/.+? b\/(.+)$/m)
      if (m) patches.set(m[1], chunk)
    }
    const stats = new Map(
      numstat
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const [a, d, p] = l.split('\t')
          return [p, { additions: Number(a) || 0, deletions: Number(d) || 0 }] as const
        }),
    )
    return names
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [status, p] = l.split('\t')
        return { path: p, status: status as FileChange['status'], ...(stats.get(p) ?? { additions: 0, deletions: 0 }), patch: patches.get(p) ?? '' }
      })
  } finally {
    fs.rmSync(index, { force: true })
  }
}

// Hash do conteúdo atual da worktree (commitado ou não, fora os ignorados): muda se qualquer arquivo mudar.
export async function worktreeTree(dir: string): Promise<string> {
  const index = path.join(os.tmpdir(), `studio-index-${randomUUID()}`)
  const e = { GIT_INDEX_FILE: index }
  try {
    await git(dir, ['read-tree', 'HEAD'], e)
    await git(dir, ['add', '-A'], e)
    return await git(dir, ['write-tree'], e)
  } finally {
    fs.rmSync(index, { force: true })
  }
}

export async function commitsSince(dir: string, base: string) {
  const out = await git(dir, ['log', '--format=%h%x09%s', `${base}..HEAD`])
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [sha, ...rest] = l.split('\t')
      return { sha, subject: rest.join('\t') }
    })
}

// Commits da branch que o origin ainda não tem (todos, se a branch nunca subiu).
export async function unpushedCount(dir: string, branch: string, base: string): Promise<number> {
  const remote = await gitOrNull(dir, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`])
  return Number(await git(dir, ['rev-list', '--count', `${remote ?? base}..HEAD`]))
}
