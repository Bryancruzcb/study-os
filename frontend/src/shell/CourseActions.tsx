import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { api, type CourseOverview } from '../api'
import { messageOf } from '../errors'
import Icon from '../icons'
import { plural } from '../plural'

interface Props {
  course: CourseOverview
  onArchived: (archived: boolean) => void | Promise<void>
  onDeleted: () => void | Promise<void>
}

/* the work both forms share: Archive or Restore, and Delete, one call at a time, with the
   failure kept to show */
function useCourseActions({ course, onArchived, onDeleted }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (e) {
      setError(messageOf(e))
      return false
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

  return { busy, error, toggleArchive, remove }
}

/* the warning that arms Delete: it says what goes with the course, because nothing brings it back */
function deleteWarning(course: CourseOverview) {
  return `Delete ${course.name} and its ${plural(course.questions, 'question')}? This can't be undone.`
}

/* Archive (or Restore) and Delete for one course, in a row, as each archived course on the
   home page lists them. Delete arms first, like a lecture's or an exam's. */
export default function CourseActions(props: Props) {
  const { course } = props
  const { busy, error, toggleArchive, remove } = useCourseActions(props)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="course-actions">
      {confirming ? (
        <>
          <span className="course-actions-warn">{deleteWarning(course)}</span>
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

/* The same actions folded behind one small button beside the course's name, so on a phone they
   never take a row of the head the question needs. It opens a short list: Archive or Restore,
   and Delete course, which arms the same warning in place. Opening puts the caret on the first
   action; Escape closes it and hands the caret back to the button, and a click or a Tab outside
   closes it too. */
export function CourseMenu(props: Props) {
  const { course } = props
  const { busy, error, toggleArchive, remove } = useCourseActions(props)
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const panelId = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const first = useRef<HTMLButtonElement>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  // Cancel returns the caret to Delete course, the action it came from, rather than the top
  const backToDelete = useRef(false)

  function close(refocus: boolean) {
    setOpen(false)
    setConfirming(false)
    if (refocus) trigger.current?.focus()
  }

  // the caret follows what the list shows: the first action on opening, Cancel once Delete
  // is armed, so Enter held a moment too long never deletes
  useEffect(() => {
    if (!open) return
    const target = confirming ? cancel : backToDelete.current ? deleteButton : first
    backToDelete.current = false
    target.current?.focus()
  }, [open, confirming])

  // a press anywhere outside closes it; the listener lives only while it is open
  useEffect(() => {
    if (!open) return
    const onPress = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) {
        setOpen(false)
        setConfirming(false)
      }
    }
    document.addEventListener('pointerdown', onPress)
    return () => document.removeEventListener('pointerdown', onPress)
  }, [open])

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      close(true)
    }
  }

  // Tab past the last action closes it; a blur with nowhere to go is a click on the page,
  // which the press listener already handles
  function onBlur(e: FocusEvent) {
    if (e.relatedTarget instanceof Node && !root.current?.contains(e.relatedTarget)) close(false)
  }

  async function archive() {
    // archiving leaves the course page; restoring stays, so the list closes behind it
    if (await toggleArchive()) close(true)
  }

  return (
    <div className="course-menu" ref={root} onKeyDown={onKeyDown} onBlur={onBlur}>
      <button ref={trigger} className="course-menu-button" type="button" aria-label="Course options"
        title="Course options" aria-expanded={open} aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}>
        <Icon name="ellipsis" size={20} />
      </button>
      {open && (
        <div id={panelId} className="course-menu-panel">
          {confirming ? (
            <>
              <p className="course-actions-warn">{deleteWarning(course)}</p>
              <div className="course-menu-confirm">
                <button className="btn btn--danger btn--micro" type="button" disabled={busy}
                  onClick={remove}>Delete forever</button>
                <button ref={cancel} className="btn btn--secondary btn--micro" type="button" disabled={busy}
                  onClick={() => { backToDelete.current = true; setConfirming(false) }}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <button ref={first} className="course-menu-item" type="button" disabled={busy} onClick={archive}>
                <Icon name={course.archived ? 'archive-restore' : 'archive'} />
                {course.archived ? 'Restore' : 'Archive'}
              </button>
              <button ref={deleteButton} className="course-menu-item course-menu-item--danger" type="button"
                disabled={busy} onClick={() => setConfirming(true)}>
                <Icon name="trash-2" />
                Delete course
              </button>
            </>
          )}
          {error && <p className="alert" role="alert">{error}</p>}
        </div>
      )}
    </div>
  )
}
