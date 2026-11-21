import { useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { getUser, onAuthChange, setUser } from '../auth'
import ThemeToggle from './ThemeToggle'

/* The top bar: the wordmark, the one place, then who is signed in and the theme. Courses
   covers the grid and everything inside a course, so it is the current page everywhere. A
   NavLink to "/" would be current at "/" alone, so this is a plain Link that says so itself. */
export default function Nav() {
  const user = useSyncExternalStore(onAuthChange, getUser)

  function signOut() {
    // whatever the server answers, this page stops acting signed in
    api.auth.logout().catch(() => undefined).finally(() => setUser(null))
  }

  return (
    <nav className="nav" aria-label="Primary">
      <span className="wordmark">Study OS</span>
      <span className="nav-links">
        <Link to="/" className="is-current" aria-current="page">Courses</Link>
      </span>
      <span className="nav-end">
        {user && (
          <span className="nav-account">
            <span className="nav-user">{user}</span>
            <button className="btn btn--ghost btn--micro" type="button" onClick={signOut}>Sign out</button>
          </span>
        )}
        <ThemeToggle />
      </span>
    </nav>
  )
}
