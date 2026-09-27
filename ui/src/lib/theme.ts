export type Theme = 'light' | 'dark' | 'system'

// A mesma chave é lida no index.html, antes do React, para a página não piscar clara.
const KEY = 'studio-theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'dark' || t === 'system' ? t : 'light'
  } catch {
    return 'light'
  }
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches))
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {}
  apply(theme)
}

media.addEventListener('change', () => apply(getTheme()))
