import { useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import { isLocked, onLockChange, setAccessCode } from '../access'

/* The live demo's lock screen. The pages render as usual until the backend answers 401; then
   they come down and this form stands in. Entering a code mounts them again, so they refetch
   with it, and a code the backend turns away brings the form straight back. */
export default function AccessGate({ children }: { children: ReactNode }) {
  const locked = useSyncExternalStore(onLockChange, isLocked)
  const [code, setCode] = useState('')
  const [tried, setTried] = useState(false)

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const c = code.trim()
    if (!c) return
    setTried(true)
    setCode('')
    setAccessCode(c)
  }

  if (!locked) return <>{children}</>

  return (
    <main className="gate">
      <form className="gate-card" onSubmit={onSubmit}>
        <h2>Study OS demo</h2>
        <p className="empty">Enter the access code that came with your link.</p>
        {tried && <p className="alert" role="alert">That code was not accepted.</p>}
        <label className="field">
          <span className="field-label">Access code</span>
          <input className="input" autoFocus autoComplete="off" value={code}
            onChange={e => setCode(e.target.value)} />
        </label>
        <button className="btn" type="submit" disabled={!code.trim()}>Unlock</button>
      </form>
    </main>
  )
}
