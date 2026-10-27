// Monta o app do Mac em app/dist: tela compilada + daemon num arquivo só + as dependências que não dá para embutir.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import * as esbuild from 'esbuild'

const HERE = import.meta.dirname
const ROOT = path.join(HERE, '..')
const OUT = path.join(HERE, 'build')
const run = (cmd, cwd = ROOT) => execSync(cmd, { cwd, stdio: 'inherit' })

// Nativas (better-sqlite3, node-pty) ou que trazem executável próprio (Claude, Codex): ficam em node_modules.
const daemonPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'daemon/package.json'), 'utf8'))
const EXTERNAL = ['better-sqlite3', 'node-pty', '@anthropic-ai/claude-agent-sdk', '@openai/codex-sdk']
const electron = JSON.parse(fs.readFileSync(path.join(HERE, 'node_modules/electron/package.json'), 'utf8')).version

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(path.join(OUT, 'daemon'), { recursive: true })

run('pnpm --filter ui build')
fs.cpSync(path.join(ROOT, 'ui/dist'), path.join(OUT, 'ui'), { recursive: true })

await esbuild.build({
  entryPoints: [path.join(ROOT, 'daemon/src/index.ts')],
  outfile: path.join(OUT, 'daemon/index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: EXTERNAL,
  // Dependências CommonJS embutidas num módulo ESM ainda chamam require.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
})
fs.copyFileSync(path.join(ROOT, 'daemon/src/mcp-bridge.mjs'), path.join(OUT, 'daemon/mcp-bridge.mjs'))
fs.copyFileSync(path.join(HERE, 'main.mjs'), path.join(OUT, 'main.mjs'))

fs.writeFileSync(
  path.join(OUT, 'package.json'),
  JSON.stringify({ name: 'david-the-studio', productName: 'david the studio', version: '0.1.0', type: 'module', main: 'main.mjs', dependencies: Object.fromEntries(EXTERNAL.map((d) => [d, daemonPkg.dependencies[d]])) }, null, 2),
)
run('npm install --omit=dev --no-audit --no-fund', OUT)

run(
  [
    'npx electron-builder --mac dir',
    `-c.electronVersion=${electron}`,
    '-c.directories.app=build',
    '-c.directories.output=dist',
    '-c.appId=com.davidthestudio.app',
    '"-c.productName=david the studio"',
    '-c.mac.icon=icon.png',
    '-c.mac.category=public.app-category.developer-tools',
    // Os executáveis do Claude e do Codex não rodam de dentro de um .asar.
    '-c.asar=false',
    '-c.mac.identity=null',
  ].join(' '),
  HERE,
)
const APP = path.join(HERE, 'dist/mac-arm64/david the studio.app')
// Sem certificado, o binário vem assinado como "Electron"; o macOS só registra as notificações com a assinatura no id do app.
run(`codesign --force --deep --sign - "${APP}"`, HERE)
console.log(`\nPronto: ${APP}`)
