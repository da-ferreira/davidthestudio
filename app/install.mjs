// Compila o app, fecha o que está aberto, troca o de /Applications e abre de novo. Os dados ficam onde estão.
import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const HERE = import.meta.dirname
const BUILT = path.join(HERE, 'dist/mac-arm64/david the studio.app')
const TARGET = '/Applications/david the studio.app'

execFileSync(process.execPath, [path.join(HERE, 'build.mjs')], { stdio: 'inherit' })

const running = () => {
  try {
    execFileSync('pgrep', ['-f', `${TARGET}/Contents/MacOS/`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
if (running()) {
  console.log('\nFechando o app…')
  execFileSync('osascript', ['-e', 'quit app "david the studio"'])
  for (let i = 0; i < 60 && running(); i++) await new Promise((r) => setTimeout(r, 500))
  if (running()) throw new Error('O app não fechou; feche ele e rode de novo.')
}

fs.rmSync(TARGET, { recursive: true, force: true })
execFileSync('ditto', [BUILT, TARGET])
execSync(`open "${TARGET}"`)
console.log(`\nAtualizado e aberto: ${TARGET}`)
