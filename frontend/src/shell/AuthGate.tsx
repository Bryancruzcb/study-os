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

type Mode = 'signin' | 'signup' | 'forgot' | 'reset'

/* One card for sign-in, sign-up, and password reset. A friend's invite link opens it on Create
   account with the code already filled in. Forgot password asks for the username (and the invite
   when the host requires one), keeps the one-time token in this card, and then asks for a new
   password — there is no email, so the token never leaves the page. */
function AuthForm() {
  const invite = getInvite()
  const [mode, setMode] = useState<Mode>(invite !== null ? 'signup' : 'signin')
  const [inviteRequired, setInviteRequired] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState(invite ?? '')
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    // until the server says, the form does not ask for a code nobody may need
    api.auth.config().then(config => setInviteRequired(config.inviteRequired)).catch(() => undefined)
  }, [])

  const needsInvite = (mode === 'signup' || mode === 'forgot') && inviteRequired
  const ready =
    mode === 'reset' ? password !== ''
    : mode === 'forgot' ? username.trim() !== '' && (!needsInvite || inviteCode.trim() !== '')
    : username.trim() !== '' && password !== '' && (!needsInvite || inviteCode.trim() !== '')

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!ready || pending) return
    setPending(true)
    setError(null)
    try {
      if (mode === 'forgot') {
        const token = await api.auth.forgotPassword(username, inviteCode)
        setResetToken(token)
        setPassword('')
        setMode('reset')
        setPending(false)
        return
      }
      if (mode === 'reset') {
        if (!resetToken) throw new Error('That reset code was not accepted.')
        const name = await api.auth.resetPassword(resetToken, password)
        setUser(name)
        return
      }
      const name = mode === 'signup'
        ? await api.auth.signup(username, password, inviteCode)
        : await api.auth.login(username, password)
      if (mode === 'signup') clearInvite()
      setUser(name)
    } catch (err) {
      // the fields keep what was typed, so a refusal costs one correction
      setError(err instanceof Error ? err.message : String(err))
      setPending(false)
    }
  }

  function go(next: Mode) {
    setMode(next)
    setError(null)
    setPassword('')
    if (next !== 'reset') setResetToken(null)
  }

  const title =
    mode === 'signup' ? 'Make an account. It starts empty, and only you see its courses.'
    : mode === 'forgot' ? 'Enter your username to choose a new password.'
    : mode === 'reset' ? 'Pick a new password. You will be signed in with it.'
    : 'Sign in to your courses.'

  return (
    <main className="gate">
      <form className="gate-card" onSubmit={onSubmit}>
        <h2>Study OS</h2>
        <p className="empty">{title}</p>
        {error && <p className="alert" role="alert">{error}</p>}
        {mode !== 'reset' && (
          <label className="field">
            <span className="field-label">Username</span>
            <input className="input" autoComplete="username" autoCapitalize="none" spellCheck={false}
              value={username} disabled={pending} onChange={e => setUsername(e.target.value)} />
          </label>
        )}
        {(mode === 'signin' || mode === 'signup' || mode === 'reset') && (
          <label className="field">
            <span className="field-label">{mode === 'reset' ? 'New password' : 'Password'}</span>
            <input className="input" type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password} disabled={pending} onChange={e => setPassword(e.target.value)} />
          </label>
        )}
        {needsInvite && (
          <label className="field">
            <span className="field-label">Invite code</span>
            <input className="input" autoComplete="off" spellCheck={false} value={inviteCode} disabled={pending}
              onChange={e => setInviteCode(e.target.value)} />
          </label>
        )}
        <button className="btn" type="submit" disabled={!ready || pending}>
          {mode === 'signup' ? 'Create account'
            : mode === 'forgot' ? 'Continue'
            : mode === 'reset' ? 'Set new password'
            : 'Sign in'}
        </button>
        {mode === 'signin' && (
          <>
            <button className="btn btn--ghost btn--micro gate-switch" type="button" disabled={pending} onClick={() => go('forgot')}>
              Forgot password?
            </button>
            <button className="btn btn--ghost btn--micro gate-switch" type="button" disabled={pending} onClick={() => go('signup')}>
              Make an account
            </button>
          </>
        )}
        {mode === 'signup' && (
          <button className="btn btn--ghost btn--micro gate-switch" type="button" disabled={pending} onClick={() => go('signin')}>
            I already have an account
          </button>
        )}
        {(mode === 'forgot' || mode === 'reset') && (
          <button className="btn btn--ghost btn--micro gate-switch" type="button" disabled={pending} onClick={() => go('signin')}>
            Back to sign in
          </button>
        )}
      </form>
    </main>
  )
}
