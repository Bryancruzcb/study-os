import { useState } from 'react'
import { api, type CourseOverview } from '../api'
import { plural } from '../plural'

/* Archive (or Restore) and Delete for one course. Delete arms first, like a lecture's or an
   exam's, and says what goes with the course, because nothing brings it back. */
export default function CourseActions({ course, onArchived, onDeleted }: {
  course: CourseOverview
  onArchived: (archived: boolean) => void | Promise<void>
  onDeleted: () => void | Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const toggleArchive = () => run(async () => {
    const next = !course.archived
    await api.setArchived(course.id, next)
    await onArchived(next)
  })

  const remove = () => run(async () => {
    await api.deleteCourse(course.id)
    await onDeleted()
  })

  return (
    <div className="course-actions">
      {confirming ? (
        <>
          <span className="course-actions-warn">
            Delete {course.name} and its {plural(course.questions, 'question')}? This can't be undone.
          </span>
          <button key="confirm" className="btn btn--danger btn--micro" type="button" disabled={busy}
            onClick={remove}>Delete forever</button>
          <button key="cancel" className="btn btn--secondary btn--micro" type="button" disabled={busy}
            onClick={() => setConfirming(false)}>Cancel</button>
        </>
      ) : (
        <>
          <button key="archive" className="btn btn--ghost btn--micro" type="button" disabled={busy}
            onClick={toggleArchive}>{course.archived ? 'Restore' : 'Archive'}</button>
          <button key="delete" className="btn btn--ghost btn--micro" type="button" disabled={busy}
            onClick={() => setConfirming(true)}>Delete course</button>
        </>
      )}
      {error && <span className="alert" role="alert">{error}</span>}
    </div>
  )
}
