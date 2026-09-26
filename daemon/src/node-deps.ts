import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import * as g from './git.ts'

const LOCKS: [file: string, pm: string][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
]

const INSTALL: Record<string, string> = {
  pnpm: 'pnpm install --frozen-lockfile',
  yarn: 'yarn install --frozen-lockfile',
  npm: 'npm ci',
}

// Marca, dentro do node_modules próprio da worktree, de qual lockfile ele foi instalado.
const STAMP = '.studio-lock'

const lockOf = (dir: string) => LOCKS.find(([file]) => fs.existsSync(path.join(dir, file)))

const hashOf = (file: string) => createHash('sha1').update(fs.readFileSync(file)).digest('hex')

function sameLock(repo: string, worktree: string, file: string) {
  const main = path.join(repo, file)
  return fs.existsSync(main) && fs.readFileSync(main).equals(fs.readFileSync(path.join(worktree, file)))
}

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
  if (!sameLock(repo, worktree, lock[0])) return
  fs.symlinkSync(source, path.join(worktree, 'node_modules'))
  await excludeFromGit(repo, '/node_modules')
}

// O .gitignore costuma ter "node_modules/", que não pega um symlink.
// O info/exclude vale para o repo e todas as worktrees.
async function excludeFromGit(repo: string, pattern: string) {
  const file = path.join(path.resolve(repo, await g.git(repo, ['rev-parse', '--git-common-dir'])), 'info', 'exclude')
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  if (current.split('\n').includes(pattern)) return
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, `${current && !current.endsWith('\n') ? '\n' : ''}${pattern}\n`)
}

export const hasLinkedNodeModules = (worktree: string) => fs.lstatSync(path.join(worktree, 'node_modules'), { throwIfNoEntry: false })?.isSymbolicLink() ?? false

// Antes dos testes. O link vale enquanto o lockfile for igual ao do repo principal; se o
// agente mudou dependências, a worktree ganha node_modules próprio. Devolve o comando de instalação, se precisar.
export async function installCommand(repo: string, worktree: string): Promise<string | null> {
  const lock = lockOf(worktree)
  if (!lock) return null
  const [file, pm] = lock
  const nm = path.join(worktree, 'node_modules')
  const st = fs.lstatSync(nm, { throwIfNoEntry: false })
  if (st?.isSymbolicLink()) {
    if (sameLock(repo, worktree, file)) return null
    fs.unlinkSync(nm)
  } else if (!st) {
    await linkNodeModules(repo, worktree)
    if (hasLinkedNodeModules(worktree)) return null
  } else {
    const stamp = path.join(nm, STAMP)
    if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === hashOf(path.join(worktree, file))) return null
  }
  return INSTALL[pm]
}

export function markInstalled(worktree: string) {
  const lock = lockOf(worktree)
  if (!lock) return
  // Sem dependências, o npm ci nem cria a pasta.
  fs.mkdirSync(path.join(worktree, 'node_modules'), { recursive: true })
  fs.writeFileSync(path.join(worktree, 'node_modules', STAMP), hashOf(path.join(worktree, lock[0])))
}
