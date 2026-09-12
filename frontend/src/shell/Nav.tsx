import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { api, type EvalReport } from '../api'

/* The segment that was current in the last nav drawn. Home renders its own nav and every
   other page renders the frame's, so moving between them mounts a fresh nav; it starts
   its pill under this segment and slides from there, instead of appearing already moved. */
let lastSegment: number | null = null

/* The floating nav pill from the landing page. The readout is chrome: a failed load
   leaves the pill with the brand and links alone rather than raising an alert over
   whichever page the user actually came for. */
export default function Nav() {
  const { pathname } = useLocation()
  const [report, setReport] = useState<EvalReport | null>(null)
  const segments = useRef<HTMLSpanElement>(null)
  const pill = useRef<HTMLSpanElement>(null)
  const drawn = useRef(false)

  useEffect(() => {
    api.evalReport().then(setReport).catch(() => setReport(null))
  }, [])

  // "Courses" covers the grid and everything inside a course. A NavLink to "/" would be
  // current at "/" alone and would write its own aria-current over ours, so this one is
  // a plain Link that says where it is current itself
  const inCourses = !pathname.startsWith('/eval')
  const current = inCourses ? 0 : 1

  // one pill slides under the links, so a switch reads as the selection moving across
  // rather than one background vanishing and another appearing
  useLayoutEffect(() => {
    const track = segments.current
    const slider = pill.current
    if (!track || !slider) return
    const links = track.querySelectorAll('a')
    const place = (i: number) => {
      slider.style.setProperty('--pill-x', `${links[i].offsetLeft}px`)
      slider.style.setProperty('--pill-y', `${links[i].offsetTop}px`)
      slider.style.setProperty('--pill-w', `${links[i].offsetWidth}px`)
      slider.style.setProperty('--pill-h', `${links[i].offsetHeight}px`)
    }
    if (!drawn.current) {
      // a new nav's pill goes down without a transition, under the segment the last nav
      // had current, and the read commits it: the page loading never slides the pill,
      // only a switch does
      slider.style.transition = 'none'
      place(lastSegment ?? current)
      void slider.offsetWidth
      slider.style.transition = ''
      drawn.current = true
    }
    place(current)
    lastSegment = current

    // the links change width when the web font lands, and the pill has to follow them.
    // jsdom has no ResizeObserver, and lays nothing out for one to watch anyway
    if (typeof ResizeObserver === 'undefined') return
    const follow = new ResizeObserver(() => place(current))
    follow.observe(track)
    return () => follow.disconnect()
  }, [current])

  return (
    <nav className="nav" aria-label="Primary">
      <span className="wordmark">Study OS</span>
      <span className="nav-links" ref={segments}>
        <span className="nav-pill" ref={pill} aria-hidden="true" />
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
