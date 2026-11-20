import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { CourseOverview } from '../api'
import Icon from '../icons'
import { plural } from '../plural'
import { ingestStatus, LECTURE_KINDS } from '../uploads'
import { CourseMenu } from './CourseActions'
import { useCourses } from './courses'
import { useFileDrop } from './fileDrop'
import Loading, { SkBlock, SkLine } from './Loading'
import PhotoChoice from './PhotoChoice'
import { useIngest, type Ingest } from './uploadState'

export type { Ingest }

export interface CourseContext {
  course: CourseOverview
  /* refetch the overview, so the head's figures follow what the page just did */
  refresh: () => Promise<void>
  /* the head's right-hand cell; a page portals its own control into it */
  slot: HTMLDivElement | null
  /* the course's ingest, kept here so it outlives the bank tab: leaving mid-ingest and
     coming back still shows Ingesting…, and the bank reloads when it lands */
  ingest: Ingest
}

const tab = ({ isActive }: { isActive: boolean }) => `tab${isActive ? ' is-current' : ''}`

/* Loads the course once and hands it to whichever tab is open. Everything under
   /courses/:courseId renders inside this. */
export default function CourseLayout() {
  const { courseId } = useParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { courses, error, refresh } = useCourses()
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  const id = Number(courseId)

  // the queue lives above the routes (UploadQueue), so an upload started here keeps going on
  // the home page and back; this course's share of it is what the pages see
  const ingest = useIngest(id)
  const { upload, finished } = ingest
  // the head's concept and question counts move each time one of this course's files lands
  useEffect(() => {
    // refresh sets state only after its await; the rule cannot see through the callback
    // oxlint-disable-next-line react/set-state-in-effect
    if (finished > 0) void refresh()
  }, [finished, refresh])
  // files dropped anywhere on a course page join its queue; while the course is still
  // loading, or does not exist, there is nowhere for them to go
  const dragging = useFileDrop(files => {
    if (courses?.some(c => c.id === id)) upload(files)
  })

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
        <Loading what="the course">
          <div className="sk-stack">
            <SkLine w="mid" tall />
            <SkLine w="long" />
            <SkBlock h="lg" />
          </div>
        </Loading>
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

  // the bank draws its own progress and failures beside the upload control
  const onBank = pathname.startsWith(`/courses/${course.id}/bank`)

  return (
    <div className="page">
      <header className="course-head">
        <div className="course-id">
          <Link className="course-back" to="/"><Icon name="chevron-left" size={16} />All courses</Link>
          {/* the course's own actions sit folded beside its name, so they never take a row of
              the head; archiving sends you home, where the course now sits under Archived,
              and restoring keeps you here */}
          <div className="course-title">
            <h1>{course.name}</h1>
            <CourseMenu course={course}
              onArchived={archived => (archived ? navigate('/') : refresh())}
              onDeleted={() => navigate('/')} />
          </div>
          <p className="course-meta">{course.archived && 'Archived · '}{course.term} · {plural(course.concepts, 'concept')} · {plural(course.questions, 'question')}</p>
        </div>
        <nav className="tabs" aria-label="Course">
          <NavLink to="study" className={tab}>Study</NavLink>
          <NavLink to="quiz" className={tab}>Quiz</NavLink>
          {/* the bank's index redirects to its first concept, so a push from inside the bank
              would leave a second entry with the same URL and one dead Back: replace instead */}
          <NavLink to="bank" replace={pathname.startsWith(`/courses/${course.id}/bank`)} className={tab}>Bank</NavLink>
          <NavLink to="dashboard" className={tab}>Dashboard</NavLink>
        </nav>
        <div className="course-head-slot" ref={setSlot} />
      </header>
      {/* photos and nothing else ask whether they are one lecture, on every tab, the bank too */}
      <PhotoChoice courseId={course.id} />
      {/* a file dropped on the study page or the dashboard uploads where it fell, and these say
          how it is going. The status region is always there, so the first update is read out */}
      {!onBank && (
        <p className="ingest-note" role="status">{ingestStatus(ingest.phase, ingest.current, ingest.waiting)}</p>
      )}
      {!onBank && ingest.error && (
        <div className="alert ingest-alert" role="alert">
          <p>{ingest.error}</p>
          <button type="button" className="btn btn--ghost btn--micro" onClick={ingest.clearError}>Dismiss</button>
        </div>
      )}
      {/* a course switch is a new visit, so every page starts over instead of keeping the last course's state */}
      <Outlet key={course.id} context={{ course, refresh, slot, ingest } satisfies CourseContext} />
      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-card">
            <Icon name="upload" size={32} />
            <p className="drop-title">Drop to add to {course.name}</p>
            <p className="drop-kinds">{LECTURE_KINDS}. Each file becomes a lecture, or several photos become one.</p>
          </div>
        </div>
      )}
    </div>
  )
}
