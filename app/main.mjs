// App do Mac: sobe o daemon (o mesmo do servidor) como processo filho e abre a tela dele numa janela.
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, dialog, shell } from 'electron'

const PORT = 4747
const ORIGIN = `http://127.0.0.1:${PORT}`
const HERE = import.meta.dirname

app.setName('david the studio')
app.setPath('userData', path.join(app.getPath('appData'), 'david the studio'))
const DATA = path.join(app.getPath('userData'), 'dados')
const LOG = path.join(app.getPath('userData'), 'daemon.log')

if (!app.requestSingleInstanceLock()) app.quit()

// Aberto pelo Finder, o app recebe um PATH mínimo; git, gh e docker estão no PATH do shell da pessoa.
function shellPath() {
  try {
    return execFileSync(process.env.SHELL || '/bin/zsh', ['-ilc', 'printf %s "$PATH"'], { encoding: 'utf8', timeout: 10_000 }).trim()
  } catch {
    return `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`
  }
}

let daemon
let win

function startDaemon() {
  fs.mkdirSync(DATA, { recursive: true })
  const log = fs.openSync(LOG, 'a')
  daemon = spawn(process.execPath, [path.join(HERE, 'daemon', 'index.mjs')], {
    env: { ...process.env, PATH: shellPath(), ELECTRON_RUN_AS_NODE: '1', STUDIO_DATA: DATA, STUDIO_UI_DIR: path.join(HERE, 'ui'), STUDIO_PORT: String(PORT) },
    stdio: ['ignore', log, log],
  })
  daemon.on('exit', (code) => {
    daemon = null
    if (!quitting) {
      dialog.showErrorBox('O studio parou', `O daemon saiu com código ${code}. Detalhes em:\n${LOG}`)
      app.quit()
    }
  })
}

async function waitHealth() {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`${ORIGIN}/api/health`)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`O daemon não respondeu. Detalhes em:\n${LOG}`)
}

function openWindow() {
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 960, minHeight: 600, backgroundColor: '#ffffff', title: 'david the studio' })
  // Links de fora (OpenProject, GitHub) abrem no navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(ORIGIN)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(ORIGIN)) return
    e.preventDefault()
    shell.openExternal(url)
  })
  win.on('closed', () => (win = null))
  win.loadURL(ORIGIN)
}

let quitting = false
app.on('before-quit', () => {
  quitting = true
  daemon?.kill('SIGTERM')
})

app.on('second-instance', () => {
  if (!win) return openWindow()
  if (win.isMinimized()) win.restore()
  win.focus()
})

// No Mac, fechar a janela não encerra o app (o daemon segue rodando os agentes e as notificações).
app.on('window-all-closed', () => {})
app.on('activate', () => {
  if (!win && daemon) openWindow()
})

app.whenReady().then(async () => {
  startDaemon()
  try {
    await waitHealth()
  } catch (e) {
    dialog.showErrorBox('O studio não abriu', e.message)
    return app.quit()
  }
  openWindow()
})
