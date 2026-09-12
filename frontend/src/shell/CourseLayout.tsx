import { useCallback, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom'
import { api, type CourseOverview } from '../api'
import { plural } from '../plural'
import { useCourses } from './courses'

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

export interface Ingest {
  uploading: boolean
  /* the last ingest's failure, until the next upload or the bank's next action clears it */
  error: string | null
  /* how many ingests have finished for this course; the bank reloads when it moves */
  finished: number
  upload: (file: File) => Promise<void>
  clearError: () => void
}

interface IngestState {
  courseId: number
  uploading: boolean
  error: string | null
  finished: number
}

const idle = (courseId: number): IngestState => ({ courseId, uploading: false, error: null, finished: 0 })

const tab = ({ isActive }: { isActive: boolean }) => `tab${isActive ? ' is-current' : ''}`

/* Loads the course once and hands it to whichever tab is open. Everything under
   /courses/:courseId renders inside this. */
export default function CourseLayout() {
  const { courseId } = useParams()
  const { pathname } = useLocation()
  const { courses, error, refresh } = useCourses()
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  // tagged with its course: this layout stays mounted across a course switch, and an
  // ingest still running for the last course must read as idle on the next one
  const id = Number(courseId)
  const [ingestState, setIngestState] = useState<IngestState>(() => idle(id))
  const upload = useCallback(async (file: File) => {
    setIngestState(s => ({ ...(s.courseId === id ? s : idle(id)), uploading: true, error: null }))
    let failure: string | null = null
    try {
      const m = await api.upload(id, file)
      if (m.status === 'FAILED') failure = m.errorMessage ?? 'Ingest failed'
    } catch (e) {
      failure = String(e)
    }
    // the head's concept and question counts just moved
    await refresh()
    setIngestState(s => {
      const base = s.courseId === id ? s : idle(id)
      return { ...base, uploading: false, error: failure, finished: base.finished + 1 }
    })
  }, [id, refresh])
  const clearIngestError = useCallback(() => setIngestState(s => ({ ...s, error: null })), [])

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

  const own = ingestState.courseId === course.id ? ingestState : idle(course.id)
  const ingest: Ingest = {
    uploading: own.uploading, error: own.error, finished: own.finished, upload, clearError: clearIngestError,
  }

  return (
    <div className="page">
      <header className="course-head">
        <div>
          <Link className="course-back" to="/">← All courses</Link>
          <p className="eyebrow">{course.term} · {plural(course.concepts, 'concept')} · {plural(course.questions, 'question')}</p>
          <h1>{course.name}</h1>
          <nav className="tabs" aria-label="Course">
            <NavLink to="study" className={tab}>Study</NavLink>
            {/* the bank's index redirects to its first concept, so a push from inside the bank
                would leave a second entry with the same URL and one dead Back: replace instead */}
            <NavLink to="bank" replace={pathname.startsWith(`/courses/${course.id}/bank`)} className={tab}>Bank</NavLink>
            <NavLink to="dashboard" className={tab}>Dashboard</NavLink>
          </nav>
        </div>
        <div className="course-head-slot" ref={setSlot} />
      </header>
      {/* a course switch is a new visit, so every page starts over instead of keeping the last course's state */}
      <Outlet key={course.id} context={{ course, refresh, slot, ingest } satisfies CourseContext} />
    </div>
  )
}
