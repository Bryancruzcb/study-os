/* Light or dark. The page follows the system's setting until the toggle in the nav picks
   one, and the pick is kept in this browser. index.html applies a kept pick before the
   first paint, so a dark page never flashes light on a reload.

   Two cells: the pick (null while the page follows the system) and the system's own
   setting. The theme on screen is derived from both, never stored. */

export type Theme = 'light' | 'dark'
export type ThemeChoice = Theme | null

/* index.html reads the same key */
export const THEME_KEY = 'studyos.theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/* the theme on screen: the pick when there is one, the system's otherwise */
export const effectiveTheme = (choice: ThemeChoice, systemDark: boolean): Theme =>
  choice ?? (systemDark ? 'dark' : 'light')

/* the toggle always lands on the other theme from the one on screen */
export const toggled = (choice: ThemeChoice, systemDark: boolean): Theme =>
  effectiveTheme(choice, systemDark) === 'dark' ? 'light' : 'dark'

function readChoice(): ThemeChoice {
  try {
    const kept = localStorage.getItem(THEME_KEY)
    return kept === 'light' || kept === 'dark' ? kept : null
  } catch {
    // storage can throw in a private window or with site data blocked; follow the system
    return null
  }
}

let choice: ThemeChoice = readChoice()
const listeners = new Set<() => void>()

function paint(next: ThemeChoice) {
  const root = document.documentElement
  if (next) root.dataset.theme = next
  else delete root.dataset.theme
}

export function getThemeChoice(): ThemeChoice {
  return choice
}

export function setThemeChoice(next: ThemeChoice) {
  if (next === choice) return
  choice = next
  paint(next)
  try {
    if (next) localStorage.setItem(THEME_KEY, next)
    else localStorage.removeItem(THEME_KEY)
  } catch {
    // kept for this visit only
  }
  listeners.forEach(listener => listener())
}

export function onThemeChoiceChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function systemQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null
}

export function systemPrefersDark(): boolean {
  return systemQuery()?.matches ?? false
}

export function onSystemThemeChange(listener: () => void): () => void {
  const query = systemQuery()
  if (!query) return () => {}
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}
