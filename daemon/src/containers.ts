import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { DATA_DIR } from './db.ts'
import { HttpError } from './http-error.ts'

const execFileP = promisify(execFile)

// Com containers, agente, testes e logins rodam isolados; só as pastas montadas ficam visíveis.
export const CONTAINERS = process.env.STUDIO_CONTAINERS === '1'

// Nem todo pacote exporta o package.json; aí sobe a partir do arquivo principal até achá-lo.
function versionOf(pkg: string, from: string) {
  const req = createRequire(fileURLToPath(import.meta.resolve(from)))
  let file: string
  try {
    file = req.resolve(`${pkg}/package.json`)
  } catch {
    let dir = path.dirname(req.resolve(pkg))
    while (!fs.existsSync(path.join(dir, 'package.json')) || JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name !== pkg) dir = path.dirname(dir)
    file = path.join(dir, 'package.json')
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')).version as string
}
const CLAUDE_VERSION = versionOf('@anthropic-ai/claude-agent-sdk', '@anthropic-ai/claude-agent-sdk')
const CODEX_VERSION = versionOf('@openai/codex', '@openai/codex-sdk')
// A tag muda quando os SDKs mudam; aí a imagem é refeita.
export const IMAGE = `${process.env.STUDIO_AGENT_IMAGE ?? 'studio-agent'}:claude-${CLAUDE_VERSION}-codex-${CODEX_VERSION}`
const DOCKERFILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docker/agent')
export const RUN_DIR = path.join(DATA_DIR, 'run')
// No Docker Desktop a pasta de dados é do Mac, e um socket ali não conecta entre containers;
// por isso run/ fica num volume do Docker, montado no agente pela subpasta.
const RUN_VOLUME = process.env.STUDIO_RUN_VOLUME

export type Mount = { path: string; readOnly?: boolean; subpath?: string }

export const runMount = (dir: string): Mount => (RUN_VOLUME ? { path: dir, subpath: path.relative(RUN_DIR, dir) } : { path: dir })

async function docker(args: string[]) {
  try {
    return (await execFileP('docker', args, { maxBuffer: 64 * 1024 * 1024 })).stdout.trim()
  } catch (err) {
    const e = err as { code?: string; stderr?: string }
    if (e.code === 'ENOENT') throw new HttpError(500, 'O Docker não está instalado nesta máquina')
    if (/Cannot connect to the Docker daemon|docker daemon is not running/i.test(e.stderr ?? '')) throw new HttpError(500, 'O Docker não está rodando')
    throw err
  }
}

let building: Promise<void> | null = null

// Na primeira vez a imagem é construída (alguns minutos); depois só confere que existe.
export function ensureImage(): Promise<void> {
  building ??= (async () => {
    try {
      await docker(['image', 'inspect', IMAGE])
    } catch (err) {
      if (err instanceof HttpError) throw err
      await docker(['build', '-t', IMAGE, '--build-arg', `CLAUDE_SDK_VERSION=${CLAUDE_VERSION}`, '--build-arg', `CODEX_VERSION=${CODEX_VERSION}`, DOCKERFILE_DIR]).catch((e) => {
        throw new HttpError(500, 'Falha ao construir a imagem do agente', [String((e as { stderr?: string }).stderr ?? e).trim().slice(-2000)])
      })
    }
  })().catch((err) => {
    building = null
    throw err
  })
  return building
}

// Mesmo caminho dentro e fora: as sessões do agente e os links da pasta da tarefa continuam válidos.
function runArgs(name: string, cwd: string, mounts: Mount[], envKeys: string[], extra: string[] = []) {
  const seen = new Set<string>()
  const volumes = mounts.flatMap((m) => {
    if (seen.has(m.path) || !fs.existsSync(m.path)) return []
    seen.add(m.path)
    if (m.subpath) return ['--mount', `type=volume,src=${RUN_VOLUME},dst=${m.path},volume-subpath=${m.subpath}${m.readOnly ? ',readonly' : ''}`]
    return ['-v', `${m.path}:${m.path}${m.readOnly ? ':ro' : ''}`]
  })
  const user = typeof process.getuid === 'function' ? ['--user', `${process.getuid()}:${process.getgid!()}`] : []
  return ['run', '--rm', '-i', '--init', '--name', name, '--label', 'studio=1', ...user, '-w', cwd, ...volumes, ...envKeys.flatMap((k) => ['-e', k]), ...extra, IMAGE]
}

// Um container por processo: parar é remover o container, o que mata também os filhos.
export function removeContainer(name: string) {
  return docker(['rm', '-f', name]).then(
    () => {},
    () => {},
  )
}

// "-e NOME" sem valor: o docker lê o valor do próprio ambiente, então segredos não aparecem na linha de comando.
export function spawnInContainer(o: {
  name: string
  cwd: string
  mounts: Mount[]
  command: string
  args: string[]
  env: Record<string, string | undefined>
  envKeys: string[]
  extra?: string[]
}): ChildProcessWithoutNullStreams {
  const child = spawn('docker', [...runArgs(o.name, o.cwd, o.mounts, o.envKeys, o.extra), o.command, ...o.args], {
    env: { ...process.env, ...o.env } as NodeJS.ProcessEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const kill = child.kill.bind(child)
  child.kill = (signal?: NodeJS.Signals | number) => {
    removeContainer(o.name)
    return kill(signal)
  }
  return child
}

// O sandbox do Codex (bubblewrap) cria namespaces, o que o seccomp padrão do Docker bloqueia.
const CODEX_SANDBOX = ['--security-opt', 'seccomp=unconfined']

// O SDK do Codex só aceita o caminho de um executável; este script chama o docker no lugar do codex.
export function codexLauncher(name: string, cwd: string, mounts: Mount[], envKeys: string[]): string {
  fs.mkdirSync(RUN_DIR, { recursive: true, mode: 0o700 })
  const file = path.join(RUN_DIR, `${name}.sh`)
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
  fs.writeFileSync(file, `#!/bin/sh\nexec docker ${[...runArgs(name, cwd, mounts, envKeys, CODEX_SANDBOX), 'codex'].map(q).join(' ')} "$@"\n`, { mode: 0o700 })
  return file
}

export const containerName = (kind: string, id: string) => `studio-${kind}-${id.toLowerCase().replace(/[^a-z0-9_.-]/g, '-')}`

// Pastas do contexto (links da raiz da tarefa) e do git que o container precisa ver.
// O .git principal e o arquivo .git da worktree ficam só leitura: um hook ou config
// plantado ali rodaria fora do container no próximo comando git do daemon.
export function taskMounts(dir: string, repos: string[], root: string, writable: boolean): Mount[] {
  const mounts: Mount[] = [{ path: dir, readOnly: !writable }]
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry)
    if (!repos.includes(entry) && fs.lstatSync(p).isSymbolicLink()) mounts.push({ path: fs.realpathSync(p), readOnly: !writable })
  }
  for (const repo of repos) {
    mounts.push({ path: path.join(root, repo, '.git'), readOnly: true })
    mounts.push({ path: path.join(dir, repo, '.git'), readOnly: true })
    const modules = path.join(dir, repo, 'node_modules')
    if (fs.existsSync(modules) && fs.lstatSync(modules).isSymbolicLink()) mounts.push({ path: fs.realpathSync(modules), readOnly: true })
  }
  return mounts
}

// Variáveis que chegam ao processo dentro do container: login e chaves dos agentes, e as que os SDKs definem.
const FORWARD = /^(CLAUDE|ANTHROPIC|CODEX|OPENAI)_|^DEBUG_CLAUDE/

// As herdadas do ambiente do daemon ficam de fora; só vão as que o studio ou o SDK definiram.
export const forwardKeys = (env: Record<string, string | undefined>) =>
  Object.keys(env).filter((k) => FORWARD.test(k) && env[k] !== undefined && env[k] !== process.env[k])

// A pasta de login do dono do agente, onde ficam credenciais e sessões.
export const homeMounts = (env: Record<string, string | undefined> | undefined): Mount[] =>
  [env?.CLAUDE_CONFIG_DIR, env?.CODEX_HOME].filter((p): p is string => !!p).map((p) => ({ path: p }))
