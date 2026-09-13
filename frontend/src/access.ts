/* The live demo sits behind an access code, because uploads and grading spend API credit and
   the app has no accounts. Locally the backend has no code and never answers 401, so none of
   this engages. The code usually arrives inside the shared link as #access=<code>. */

const KEY = 'studyos.access-code'
const LINK = /^#access=(.+)$/

// storage can throw (a private window, blocked site data); the code then lasts this visit
let fallback: string | null = null
let locked = false
const listeners = new Set<() => void>()

export function getAccessCode(): string | null {
  try {
    return localStorage.getItem(KEY) ?? fallback
  } catch {
    return fallback
  }
}

export function setAccessCode(code: string) {
  fallback = code
  try {
    localStorage.setItem(KEY, code)
  } catch {
    // kept in memory only
  }
  setLocked(false)
}

/* Runs once before the app renders, so its first requests already carry the code. The code
   comes out of the address bar so it is not copied along with a link to some page. */
export function takeCodeFromLink() {
  const match = LINK.exec(window.location.hash)
  if (!match) return
  let code = match[1]
  try {
    code = decodeURIComponent(code)
  } catch {
    // a stray % is part of the code, not an escape
  }
  setAccessCode(code)
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

export function isLocked(): boolean {
  return locked
}

export function markLocked() {
  setLocked(true)
}

export function onLockChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setLocked(next: boolean) {
  if (locked === next) return
  locked = next
  listeners.forEach(listener => listener())
}
