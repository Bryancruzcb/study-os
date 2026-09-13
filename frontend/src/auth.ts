/* Who is signed in, for the gate and the nav: a username, or null. Every call that answers 401 marks
   the page signed out, so a session that ends brings the sign-in form back wherever the page was. */

const INVITE_KEY = 'studyos.invite'
const LINK = /^#invite=(.+)$/

let user: string | null = null
// storage can throw (a private window, blocked site data); the invite then lasts this visit
let inviteFallback: string | null = null
const listeners = new Set<() => void>()

export function getUser(): string | null {
  return user
}

export function setUser(next: string | null) {
  if (user === next) return
  user = next
  listeners.forEach(listener => listener())
}

export function markSignedOut() {
  setUser(null)
}

export function onAuthChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/* An invite arrives inside the shared link as #invite=<code>. This runs once before the app renders.
   The code is kept for the sign-up form and taken out of the address bar, so it is not copied along
   with a link to some page. */
export function takeInviteFromLink() {
  const match = LINK.exec(window.location.hash)
  if (!match) return
  let code = match[1]
  try {
    code = decodeURIComponent(code)
  } catch {
    // a stray % is part of the code, not an escape
  }
  inviteFallback = code
  try {
    localStorage.setItem(INVITE_KEY, code)
  } catch {
    // kept in memory only
  }
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

export function getInvite(): string | null {
  try {
    return localStorage.getItem(INVITE_KEY) ?? inviteFallback
  } catch {
    return inviteFallback
  }
}

/* an invite is used up once its account exists, so the next person on this browser is not handed it */
export function clearInvite() {
  inviteFallback = null
  try {
    localStorage.removeItem(INVITE_KEY)
  } catch {
    // nothing was stored
  }
}
