// App do Mac: sobe o daemon (o mesmo do servidor) como processo filho e abre a tela dele numa janela.
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app, BrowserWindow, dialog, Notification, shell } from 'electron'

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
    stdio: ['ignore', log, log, 'ipc'],
  })
  daemon.on('message', (m) => {
    if (m?.kind === 'notify') return showNotification(m)
    if (m?.kind !== 'pdf') return
    renderPdf(m.html).then(
      (pdf) => daemon?.send({ kind: 'pdf', id: m.id, pdf: pdf.toString('base64') }),
      (e) => daemon?.send({ kind: 'pdf', id: m.id, error: e.message }),
    )
  })
  daemon.on('exit', (code) => {
    daemon = null
    if (!quitting) {
      dialog.showErrorBox('O studio parou', `O daemon saiu com código ${code}. Detalhes em:\n${LOG}`)
      app.quit()
    }
  })
}

// Largura do conteúdo do tutorial (760 + margens): a página do PDF fica do tamanho dele, sem sobra dos lados.
const PDF_WIDTH = 824
// O PDF não aceita página com mais de 200 polegadas; tutoriais mais longos viram páginas da mesma largura.
const MAX_HEIGHT = 19_000

async function renderPdf(html) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-pdf-')), 'tutorial.html')
  fs.writeFileSync(file, html)
  const w = new BrowserWindow({ show: false, width: PDF_WIDTH, height: 1000, useContentSize: true, webPreferences: { sandbox: true } })
  try {
    await w.loadFile(file)
    const height = await w.webContents.executeJavaScript('Math.ceil(document.documentElement.scrollHeight) + 2')
    const pageHeight = height > MAX_HEIGHT ? Math.round(PDF_WIDTH * 1.414) : height
    return await w.webContents.printToPDF({ printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 }, pageSize: { width: PDF_WIDTH / 96, height: pageHeight / 96 } })
  } finally {
    w.destroy()
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  }
}

// Com a janela em foco quem avisa é o sino da tela; fora dela, o macOS.
function showNotification({ id, title, body, link }) {
  if (win?.isFocused() || !Notification.isSupported()) return
  const n = new Notification({ title, body })
  n.on('click', () => {
    if (!win) return openWindow(link)
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    win.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('studio-notification', { detail: ${JSON.stringify({ id, link })} }))`)
  })
  n.show()
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

function openWindow(link) {
  // Sem a barra de título do macOS (fica escura no modo escuro); os três botões ficam sobre a sidebar.
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 960, minHeight: 600, backgroundColor: '#ffffff', title: 'david the studio', titleBarStyle: 'hidden', trafficLightPosition: { x: 18, y: 18 } })
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
  win.loadURL(link ? ORIGIN + link : ORIGIN)
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
