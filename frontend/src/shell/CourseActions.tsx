import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent } from 'react'
import { api, type CourseOverview } from '../api'
import { messageOf } from '../errors'
import Icon from '../icons'
import { plural } from '../plural'

interface Props {
  course: CourseOverview
  onArchived: (archived: boolean) => void | Promise<void>
  onDeleted: () => void | Promise<void>
  /* after a rename, so the head shows the new name and term */
  onEdited?: () => void | Promise<void>
}

/* the work both forms share: Archive or Restore, Delete, and a rename, one call at a time,
   with the failure kept to show */
function useCourseActions({ course, onArchived, onDeleted, onEdited }: Props) {
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

  const rename = (name: string, term: string) => run(async () => {
    await api.updateCourse(course.id, name, term)
    await onEdited?.()
  })

  // stable, so the menu's outside-press listener is not torn down and added again every render
  const clearError = useCallback(() => setError(null), [])

  return { busy, error, clearError, toggleArchive, remove, rename }
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
   never take a row of the head the question needs. It opens a short list: Edit course, which
   swaps the list for the name and term fields, Archive or Restore, and Delete course, which
   arms the same warning in place. Opening puts the caret on the first action; Escape closes it
   and hands the caret back to the button, and a click or a Tab outside closes it too. */
export function CourseMenu(props: Props) {
  const { course } = props
  const { busy, error, clearError, toggleArchive, remove, rename } = useCourseActions(props)
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(course.name)
  const [term, setTerm] = useState(course.term)
  const panelId = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const first = useRef<HTMLButtonElement>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const nameField = useRef<HTMLInputElement>(null)
  // Cancel returns the caret to the action it came from, Delete course or Edit course, rather
  // than to the top
  const backToDelete = useRef(false)
  // a failed save hands the caret back to the name field once the fields are enabled again:
  // the field or button that held it was disabled for the call, which drops focus to the page
  const refocusName = useRef(false)

  // a failure belongs to the attempt that made it, so it goes when the menu or the edit does
  function close(refocus: boolean) {
    setOpen(false)
    setConfirming(false)
    setEditing(false)
    clearError()
    if (refocus) trigger.current?.focus()
  }

  function startEditing() {
    // the fields start from the course as it is now, not from an edit that was abandoned
    setName(course.name)
    setTerm(course.term)
    clearError()
    setEditing(true)
  }

  function stopEditing() {
    setEditing(false)
    clearError()
  }

  useEffect(() => {
    if (busy || !refocusName.current) return
    refocusName.current = false
    nameField.current?.focus()
  }, [busy])

  // the caret follows what the list shows: the first action on opening, the name field while
  // editing, Cancel once Delete is armed, so Enter held a moment too long never deletes
  useEffect(() => {
    if (!open) return
    if (editing) {
      nameField.current?.focus()
      return
    }
    const target = confirming ? cancel : backToDelete.current ? deleteButton : first
    backToDelete.current = false
    target.current?.focus()
  }, [open, confirming, editing])

  // a press anywhere outside closes it; the listener lives only while it is open
  useEffect(() => {
    if (!open) return
    const onPress = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) {
        setOpen(false)
        setConfirming(false)
        setEditing(false)
        clearError()
      }
    }
    document.addEventListener('pointerdown', onPress)
    return () => document.removeEventListener('pointerdown', onPress)
  }, [open, clearError])

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

  const trimmedName = name.trim()
  const trimmedTerm = term.trim()
  const unchanged = trimmedName === course.name && trimmedTerm === course.term

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!trimmedName || !trimmedTerm || busy) return
    // nothing to send, so nothing to wait for
    if (unchanged || await rename(trimmedName, trimmedTerm)) close(true)
    else refocusName.current = true
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
          {editing ? (
            <form className="course-edit" aria-label="Edit course" onSubmit={save}>
              <label className="field">
                <span className="field-label">Name</span>
                <input className="input" ref={nameField} value={name} disabled={busy}
                  onChange={e => setName(e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Term</span>
                <input className="input" value={term} disabled={busy}
                  onChange={e => setTerm(e.target.value)} />
              </label>
              <div className="course-menu-confirm">
                <button className="btn btn--micro" type="submit"
                  disabled={busy || !trimmedName || !trimmedTerm}>Save</button>
                <button className="btn btn--secondary btn--micro" type="button" disabled={busy}
                  onClick={stopEditing}>Cancel</button>
              </div>
            </form>
          ) : confirming ? (
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
              <button ref={first} className="course-menu-item" type="button" disabled={busy} onClick={startEditing}>
                <Icon name="pencil" />
                Edit course
              </button>
              <button className="course-menu-item" type="button" disabled={busy} onClick={archive}>
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
