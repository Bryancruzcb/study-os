import { NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom'
import type { CourseContext } from '../shell/CourseLayout'

const mode = ({ isActive }: { isActive: boolean }) => `tab${isActive ? ' is-current' : ''}`

/* Study and Quiz are one Practice tab. This switch sits above both and says what the open one
   is for. Each mode keeps its own address, so a link to /study or /quiz still opens that mode. */
export default function Practice() {
  const context = useOutletContext<CourseContext>()
  const { pathname } = useLocation()
  // the route matches /quiz/ too, so the hint has to
  const quiz = /\/quiz\/?$/.test(pathname)

  return (
    <>
      <div className="mode-bar">
        <nav className="tabs mode-switch" aria-label="Practice mode">
          <NavLink to="study" className={mode}>Study</NavLink>
          <NavLink to="quiz" className={mode}>Quiz</NavLink>
        </nav>
        <p className="mode-hint">
          {quiz
            ? 'Test yourself on whole lectures and get a score at the end.'
            : 'Today’s reviews, each topic timed to come back just before you would forget it.'}
        </p>
      </div>
      <Outlet context={context} />
    </>
  )
}
