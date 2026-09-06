import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { api, type EvalReport } from '../api'

/* The floating nav pill from the landing page. The readout is chrome: a failed load
   leaves the pill with the brand and links alone rather than raising an alert over
   whichever page the user actually came for. */
export default function Nav() {
  const { pathname } = useLocation()
  const [report, setReport] = useState<EvalReport | null>(null)

  useEffect(() => {
    api.evalReport().then(setReport).catch(() => setReport(null))
  }, [])

  // "Courses" covers the grid and everything inside a course. A NavLink to "/" would be
  // current at "/" alone and would write its own aria-current over ours, so this one is
  // a plain Link that says where it is current itself
  const inCourses = !pathname.startsWith('/eval')

  return (
    <nav className="nav" aria-label="Primary">
      <span className="wordmark">Study OS</span>
      <span className="nav-links">
        <Link to="/" className={inCourses ? 'is-current' : undefined}
          aria-current={inCourses ? 'page' : undefined}>Courses</Link>
        <NavLink to="/eval" className={({ isActive }) => (isActive ? 'is-current' : undefined)}>Evaluation</NavLink>
      </span>
      {report && (
        <span className="readout">
          <span>{report.labeled} labeled</span>
          <span>{report.gradedShortAnswers} graded</span>
          {report.gradedShortAnswers > 0 && <span>{Math.round(report.graderAgreement * 100)}% agreement</span>}
        </span>
      )}
    </nav>
  )
}
