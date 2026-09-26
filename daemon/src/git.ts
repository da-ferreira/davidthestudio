import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

// Sem prompt de credencial: o daemon não tem terminal, o git travaria esperando.
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }

export async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, { cwd, env, maxBuffer: 64 * 1024 * 1024 })
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
