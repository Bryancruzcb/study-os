import { useCallback, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api, type CourseOverview } from '../api'
import Icon from '../icons'
import { plural } from '../plural'
import { ingestStatus, LECTURE_KINDS, uploadProblem, type IngestPhase } from '../uploads'
import { CourseMenu } from './CourseActions'
import { useCourses } from './courses'
import { useFileDrop } from './fileDrop'
import Loading, { SkBlock, SkLine } from './Loading'

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
  /* true while any of this course's files is being sent, read, or waiting its turn */
  uploading: boolean
  /* idle | waiting (queued behind another file) | uploading (bytes on the wire) |
     processing (extraction in the background) */
  phase: IngestPhase
  /* the file being sent or read, while one is */
  current: string | null
  /* this course's files queued behind the current one */
  waiting: number
  /* the batch's failures, one line per file, until the next batch or the bank's next action clears them */
  error: string | null
  /* how many files have finished for this course; the bank reloads when it moves */
  finished: number
  /* queue files for this course; each becomes its own lecture, one after another */
  upload: (files: readonly File[]) => void
  clearError: () => void
}

/* one file on its way into one course */
interface Job {
  courseId: number
  file: File
}

interface Active {
  courseId: number
  name: string
  phase: 'uploading' | 'processing'
}

interface Outcome {
  error: string | null
  finished: number
}

const NOTHING_YET: Outcome = { error: null, finished: 0 }
const POLL_MS = 1500

function withFailures(error: string | null, failures: readonly string[]): string | null {
  const lines = [...(error ? [error] : []), ...failures]
  return lines.length > 0 ? lines.join('\n') : null
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

  // One worker sends the queued files one at a time, whichever course each is for, so two
  // drops never race each other to the server. The queue is a ref because the worker reads it
  // between awaits; `waiting` mirrors it for the render. Every job carries its course: this
  // layout stays mounted across a course switch, and a file still on its way into the last
  // course must neither show on the next one nor land in it.
  const queue = useRef<Job[]>([])
  const working = useRef(false)
  const [active, setActive] = useState<Active | null>(null)
  const [waiting, setWaiting] = useState<readonly Job[]>([])
  const [outcomes, setOutcomes] = useState<Readonly<Record<number, Outcome>>>({})

  const finish = useCallback((courseId: number, failure: string | null) => setOutcomes(all => {
    const own = all[courseId] ?? NOTHING_YET
    return { ...all, [courseId]: { error: withFailures(own.error, failure ? [failure] : []), finished: own.finished + 1 } }
  }), [])

  // one file: send it, then poll while its long deck finishes in the background; the failure
  // comes back as a line naming the file
  const send = useCallback(async ({ courseId: to, file }: Job): Promise<string | null> => {
    setActive({ courseId: to, name: file.name, phase: 'uploading' })
    try {
      let m = await api.upload(to, file)
      if (m.status === 'PENDING') {
        setActive({ courseId: to, name: file.name, phase: 'processing' })
        while (m.status === 'PENDING') {
          await new Promise(r => setTimeout(r, POLL_MS))
          m = await api.material(m.id)
        }
      }
      return m.status === 'FAILED' ? `${file.name}: ${m.errorMessage ?? 'Ingest failed'}` : null
    } catch (e) {
      return `${file.name}: ${String(e)}`
    }
  }, [])

  const work = useCallback(async () => {
    if (working.current) return
    working.current = true
    try {
      for (let job = queue.current.shift(); job; job = queue.current.shift()) {
        setWaiting([...queue.current])
        const failure = await send(job)
        // the head's concept and question counts just moved
        await refresh()
        finish(job.courseId, failure)
      }
    } finally {
      working.current = false
      setActive(null)
      setWaiting([])
    }
  }, [send, refresh, finish])

  // a file the browser can tell is not a lecture, or is too big, is refused here and never sent
  const enqueue = useCallback((to: number, files: readonly File[]) => {
    const refused: string[] = []
    const jobs: Job[] = []
    for (const file of files) {
      const problem = uploadProblem(file)
      if (problem) refused.push(`${file.name} ${problem}`)
      else jobs.push({ courseId: to, file })
    }
    // a new batch starts clean; files added while one runs add to its failures
    const fresh = !working.current
    setOutcomes(all => {
      const own = all[to] ?? NOTHING_YET
      return { ...all, [to]: { ...own, error: withFailures(fresh ? null : own.error, refused) } }
    })
    if (jobs.length === 0) return
    queue.current.push(...jobs)
    setWaiting([...queue.current])
    void work()
  }, [work])

  const upload = useCallback((files: readonly File[]) => enqueue(id, files), [enqueue, id])
  const clearIngestError = useCallback(() => setOutcomes(all => (
    all[id]?.error ? { ...all, [id]: { ...all[id], error: null } } : all
  )), [id])
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

  const running = active?.courseId === course.id ? active : null
  const queued = waiting.filter(job => job.courseId === course.id).length
  const outcome = outcomes[course.id] ?? NOTHING_YET
  const phase: IngestPhase = running ? running.phase : queued > 0 ? 'waiting' : 'idle'
  const current = running?.name ?? null
  const ingest: Ingest = {
    uploading: phase !== 'idle',
    phase,
    current,
    waiting: queued,
    error: outcome.error,
    finished: outcome.finished,
    upload,
    clearError: clearIngestError,
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
      {/* a file dropped on the study page or the dashboard uploads where it fell, and these say
          how it is going. The status region is always there, so the first update is read out */}
      {!onBank && (
        <p className="ingest-note" role="status">{ingestStatus(phase, current, queued)}</p>
      )}
      {!onBank && outcome.error && (
        <div className="alert ingest-alert" role="alert">
          <p>{outcome.error}</p>
          <button type="button" className="btn btn--ghost btn--micro" onClick={clearIngestError}>Dismiss</button>
        </div>
      )}
      {/* a course switch is a new visit, so every page starts over instead of keeping the last course's state */}
      <Outlet key={course.id} context={{ course, refresh, slot, ingest } satisfies CourseContext} />
      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-card">
            <Icon name="upload" size={32} />
            <p className="drop-title">Drop to add to {course.name}</p>
            <p className="drop-kinds">{LECTURE_KINDS}. Each file becomes a lecture.</p>
          </div>
        </div>
      )}
    </div>
  )
}
