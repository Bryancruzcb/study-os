import { useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import type { CourseOverview } from '../api'
import { plural } from '../plural'
import { useCourses } from './courses'

export interface CourseContext {
  course: CourseOverview
  /* refetch the overview, so the head's figures follow what the page just did */
  refresh: () => Promise<void>
  /* the head's right-hand cell; a page portals its own control into it */
  slot: HTMLDivElement | null
}

const tab = ({ isActive }: { isActive: boolean }) => `tab${isActive ? ' is-current' : ''}`

/* Loads the course once and hands it to whichever tab is open. Everything under
   /courses/:courseId renders inside this. */
export default function CourseLayout() {
  const { courseId } = useParams()
  const { courses, error, refresh } = useCourses()
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)

  if (error) {
    return (
      <div className="page">
        <p className="alert" role="alert">{error}</p>
      </div>
    )
  }
  if (!courses) {
    return (
      <div className="page">
        <p className="empty">Loading…</p>
      </div>
    )
  }

  // Number('abc') is NaN and matches nothing, which is the not-found state we want
  const course = courses.find(c => c.id === Number(courseId))
  if (!course) {
    return (
      <div className="page">
        <p className="alert" role="alert">No course has id {courseId}.</p>
        <Link className="btn btn--ghost" to="/">All courses</Link>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="course-head">
        <div>
          <p className="eyebrow">{course.term} · {plural(course.concepts, 'concept')} · {plural(course.questions, 'question')}</p>
          <h1>{course.name}</h1>
          <nav className="tabs" aria-label="Course">
            <NavLink to="study" className={tab}>Study</NavLink>
            <NavLink to="bank" className={tab}>Bank</NavLink>
            <NavLink to="dashboard" className={tab}>Dashboard</NavLink>
          </nav>
        </div>
        <div className="course-head-slot" ref={setSlot} />
      </header>
      {/* a course switch is a new visit, so every page starts over instead of keeping the last course's state */}
      <Outlet key={course.id} context={{ course, refresh, slot } satisfies CourseContext} />
    </div>
  )
}
