import fs from 'node:fs'
import path from 'node:path'
import * as g from './git.ts'

const LOCKS: [file: string, pm: string][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
]

const lockOf = (dir: string) => LOCKS.find(([file]) => fs.existsSync(path.join(dir, file)))

// Sugere "<pm> test" a partir do scripts.test do package.json. O placeholder do
// npm init ("no test specified") não conta como teste.
export function suggestTest(dir: string): string | null {
  let pkg: { scripts?: Record<string, string> }
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  } catch {
    return null
  }
  const script = pkg.scripts?.test
  if (!script || /no test specified/.test(script)) return null
  return `${lockOf(dir)?.[1] ?? 'npm'} test`
}

// Instalar dependências em cada worktree levaria minutos. Se o lockfile da worktree é
// igual ao do repo principal, o node_modules dele serve e entra por symlink.
export async function linkNodeModules(repo: string, worktree: string) {
  const source = path.join(repo, 'node_modules')
  const lock = lockOf(worktree)
  if (!lock || !fs.existsSync(source)) return
  const [file] = lock
  const main = path.join(repo, file)
  if (!fs.existsSync(main) || !fs.readFileSync(main).equals(fs.readFileSync(path.join(worktree, file)))) return
  fs.symlinkSync(source, path.join(worktree, 'node_modules'))
  await excludeFromGit(repo, '/node_modules')
}

// O .gitignore costuma ter "node_modules/", que não pega um symlink; e um .env criado
// pela tela não pode entrar num commit. O info/exclude vale para o repo e todas as worktrees.
export async function excludeFromGit(repo: string, pattern: string) {
  const file = path.join(path.resolve(repo, await g.git(repo, ['rev-parse', '--git-common-dir'])), 'info', 'exclude')
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  if (current.split('\n').includes(pattern)) return
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, `${current && !current.endsWith('\n') ? '\n' : ''}${pattern}\n`)
}

export const hasLinkedNodeModules = (worktree: string) => fs.lstatSync(path.join(worktree, 'node_modules'), { throwIfNoEntry: false })?.isSymbolicLink() ?? false
