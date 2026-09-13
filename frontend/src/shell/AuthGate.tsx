import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import { api } from '../api'
import { clearInvite, getInvite, getUser, onAuthChange, setUser } from '../auth'

/* The pages render only for a signed-in account. The first thing the page does is ask the server
   whose session this is; until it answers nothing shows, and when the answer is nobody, or a later
   call finds the session gone, the pages come down and the sign-in form stands in. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(onAuthChange, getUser)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    api.auth.me()
      .then(setUser)
      // a failed check counts as signed out: the form is the one place a person can act from
      .catch(() => setUser(null))
      .finally(() => setChecked(true))
  }, [])

  if (!checked) return null
  if (user === null) return <AuthForm />
  return <>{children}</>
}

/* One card for both ways in. A friend's invite link opens it on Create account with the code
   already filled in. */
function AuthForm() {
  const invite = getInvite()
  const [signingUp, setSigningUp] = useState(invite !== null)
  const [inviteRequired, setInviteRequired] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState(invite ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    // until the server says, the form does not ask for a code nobody may need
    api.auth.config().then(config => setInviteRequired(config.inviteRequired)).catch(() => undefined)
  }, [])

  const needsInvite = signingUp && inviteRequired
  const ready = username.trim() !== '' && password !== '' && (!needsInvite || inviteCode.trim() !== '')

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!ready || pending) return
    setPending(true)
    setError(null)
    try {
      const name = signingUp
        ? await api.auth.signup(username, password, inviteCode)
        : await api.auth.login(username, password)
      if (signingUp) clearInvite()
      setUser(name)
    } catch (err) {
      // the fields keep what was typed, so a refusal costs one correction
      setError(err instanceof Error ? err.message : String(err))
      setPending(false)
    }
  }

  function switchWay() {
    setSigningUp(!signingUp)
    setError(null)
  }

  return (
    <main className="gate">
      <form className="gate-card" onSubmit={onSubmit}>
        <h2>Study OS</h2>
        <p className="empty">
          {signingUp ? 'Make an account. It starts empty, and only you see its courses.' : 'Sign in to your courses.'}
        </p>
        {error && <p className="alert" role="alert">{error}</p>}
        <label className="field">
          <span className="field-label">Username</span>
          <input className="input" autoComplete="username" autoCapitalize="none" spellCheck={false}
            value={username} disabled={pending} onChange={e => setUsername(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input className="input" type="password" autoComplete={signingUp ? 'new-password' : 'current-password'}
            value={password} disabled={pending} onChange={e => setPassword(e.target.value)} />
        </label>
        {needsInvite && (
          <label className="field">
            <span className="field-label">Invite code</span>
            <input className="input" autoComplete="off" spellCheck={false} value={inviteCode} disabled={pending}
              onChange={e => setInviteCode(e.target.value)} />
          </label>
        )}
        <button className="btn" type="submit" disabled={!ready || pending}>
          {signingUp ? 'Create account' : 'Sign in'}
        </button>
        <button className="btn btn--ghost btn--micro gate-switch" type="button" disabled={pending} onClick={switchWay}>
          {signingUp ? 'I already have an account' : 'Make an account'}
        </button>
      </form>
    </main>
  )
}
