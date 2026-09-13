import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { api, type Exam, type ExamInput, type ExamPlan, type Lecture } from '../api'
import { dayLabel } from '../dates'
import { plural } from '../plural'

/* when the exam is, counted from today */
function when(exam: Exam): string {
  if (exam.status === 'today') return 'today'
  if (exam.status === 'past' || !exam.plan) return 'passed'
  return exam.plan.daysLeft === 1 ? 'tomorrow' : `in ${exam.plan.daysLeft} days`
}

/* what today holds for the exam: the topics to start and the reviews to do */
function todayLine(plan: ExamPlan): string {
  const parts = [
    plan.newToday > 0 ? plural(plan.newToday, 'new topic') : null,
    plan.reviewsToday > 0 ? plural(plan.reviewsToday, 'review') : null,
  ].filter((part): part is string => part !== null)
  return parts.length > 0 ? `Today: ${parts.join(' and ')}` : 'Nothing due for this exam today'
}

/* where the plan stands: how much is started, and when starting topics gives way to review */
function outlook(plan: ExamPlan): string {
  if (plan.topics === 0) return 'Its lectures have no topics with questions yet.'
  if (plan.topicsLeft === 0) return 'Every topic is started. Reviewing until the exam.'
  const review = plan.reviewDays > 0 ? `, then ${plural(plan.reviewDays, 'day')} of review` : ''
  return `${plan.topics - plan.topicsLeft} of ${plural(plan.topics, 'topic')} started. New topics through ${dayLabel(plan.lastNewDay)}${review}.`
}

/* A course's exams, and for each one still ahead what today holds for it. Adding, moving or
   removing an exam replans the course on the server, so the page's other numbers are told to
   reload. */
export default function Exams({ courseId, onChange }: { courseId: number; onChange: () => void }) {
  const [exams, setExams] = useState<Exam[] | null>(null)
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [error, setError] = useState<string | null>(null)
  // the exam whose form is open, 'new' for the add form, or null with no form open
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  // closing a form unmounts the control the caret sat on; the heading takes it
  const heading = useRef<HTMLHeadingElement>(null)
  const landOnHeading = useRef(false)

  useLayoutEffect(() => {
    if (!landOnHeading.current || editing !== null) return
    landOnHeading.current = false
    heading.current?.focus()
  })

  const load = useCallback(async () => {
    try {
      const [loadedExams, loadedLectures] = await Promise.all([api.exams(courseId), api.lectures(courseId)])
      setExams(loadedExams)
      setLectures(loadedLectures)
    } catch (e) {
      setError(String(e))
    }
  }, [courseId])

  useEffect(() => {
    // load sets state only after its await; the rule cannot see through the callback
    // oxlint-disable-next-line react/set-state-in-effect
    load()
  }, [load])

  function close() {
    landOnHeading.current = true
    setEditing(null)
  }

  async function changed() {
    close()
    await load()
    onChange()
  }

  // a new exam starts with the lectures no exam covers yet: the midterm takes what is uploaded,
  // and a later final takes what came after it
  const covered = new Set((exams ?? []).flatMap(exam => exam.lectureIds))

  return (
    <section className="dash-card" aria-labelledby="exams-title">
      <div className="dash-head">
        <h2 id="exams-title" className="dash-title" tabIndex={-1} ref={heading}>Exams</h2>
        {exams && editing === null && (
          <button className="btn btn--secondary btn--micro" onClick={() => setEditing('new')}>Add an exam</button>
        )}
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      {exams && exams.length === 0 && editing === null && (
        <p className="empty">Add an exam and each day's topics are paced to its date: a few a day while it is far off, more as it gets close.</p>
      )}
      {editing === 'new' && (
        <ExamForm lectures={lectures}
          initial={{ name: '', date: '', lectureIds: lectures.filter(l => !covered.has(l.id)).map(l => l.id) }}
          onSave={body => api.createExam(courseId, body).then(changed)}
          onCancel={close} setError={setError} />
      )}
      {exams && exams.length > 0 && (
        <ul className="exam-list">
          {exams.map(exam => (
            <li key={exam.id} className={`exam exam--${exam.status}`}>
              {editing === exam.id ? (
                <ExamForm lectures={lectures}
                  initial={{ name: exam.name, date: exam.date, lectureIds: exam.lectureIds }}
                  onSave={body => api.updateExam(exam.id, body).then(changed)}
                  onDelete={() => api.deleteExam(exam.id).then(changed)}
                  onCancel={close} setError={setError} />
              ) : (
                <>
                  <div className="exam-head">
                    <h3>{exam.name}</h3>
                    <p className="exam-when">{dayLabel(exam.date)} · {when(exam)}</p>
                    {editing === null && (
                      <button className="btn btn--ghost btn--micro" aria-label={`Edit ${exam.name}`}
                        onClick={() => setEditing(exam.id)}>Edit</button>
                    )}
                  </div>
                  {exam.plan ? (
                    <>
                      <p className="exam-today">{todayLine(exam.plan)}</p>
                      <p className="exam-outlook">{outlook(exam.plan)} Covers {plural(exam.lectureIds.length, 'lecture')}.</p>
                    </>
                  ) : (
                    <p className="exam-outlook">{exam.status === 'today' ? 'The exam is today.' : 'This exam has passed.'}</p>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ExamForm({ lectures, initial, onSave, onDelete, onCancel, setError }: {
  lectures: Lecture[]
  initial: ExamInput
  onSave: (body: ExamInput) => Promise<void>
  onDelete?: () => Promise<void>
  onCancel: () => void
  setError: (error: string | null) => void
}) {
  const [name, setName] = useState(initial.name)
  const [date, setDate] = useState(initial.date)
  const [picked, setPicked] = useState(() => new Set(initial.lectureIds))
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const nameField = useRef<HTMLInputElement>(null)
  const ready = name.trim() !== '' && date !== '' && picked.size > 0

  // the form is only reachable from the keyboard if opening it moves the caret inside
  useLayoutEffect(() => {
    nameField.current?.focus()
  }, [])

  async function act(work: () => Promise<void>) {
    setSaving(true)
    setError(null)
    try {
      await work()
    } catch (e) {
      // the form stays open with what was typed, so a failure costs a click
      setError(String(e))
      setSaving(false)
    }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!ready || saving) return
    act(() => onSave({ name: name.trim(), date, lectureIds: lectures.filter(l => picked.has(l.id)).map(l => l.id) }))
  }

  function toggle(id: number) {
    setPicked(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <form className="exam-form" onSubmit={submit}
      onKeyDown={e => { if (e.key === 'Escape' && !saving) onCancel() }}>
      <div className="exam-form-row">
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input" ref={nameField} value={name} disabled={saving}
            onChange={e => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Date</span>
          <input className="input" type="date" value={date} disabled={saving}
            onChange={e => setDate(e.target.value)} />
        </label>
      </div>
      <fieldset className="exam-lectures" disabled={saving}>
        <legend className="field-label">Lectures it covers</legend>
        {lectures.length === 0 ? (
          <p className="empty">No lectures yet. Upload one in the bank and an exam can cover it.</p>
        ) : lectures.map(lecture => (
          <label key={lecture.id} className="exam-lecture">
            <input type="checkbox" checked={picked.has(lecture.id)} onChange={() => toggle(lecture.id)} />
            <span className="exam-lecture-name">{lecture.filename}</span>
            <span className="count">{plural(lecture.concepts, 'topic')}</span>
          </label>
        ))}
      </fieldset>
      <div className="exam-form-actions">
        <button className="btn btn--micro" type="submit" disabled={!ready || saving}>Save exam</button>
        <button className="btn btn--secondary btn--micro" type="button" disabled={saving} onClick={onCancel}>Cancel</button>
        {onDelete && (confirming ? (
          <button key="confirm" className="btn btn--danger btn--micro exam-delete" type="button" disabled={saving}
            onClick={() => act(onDelete)}>Confirm delete</button>
        ) : (
          <button key="delete" className="btn btn--ghost btn--micro exam-delete" type="button" disabled={saving}
            onClick={() => setConfirming(true)}>Delete exam</button>
        ))}
      </div>
    </form>
  )
}
