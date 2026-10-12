import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api, type Exam, type ExamInput, type Lecture } from '../api'
import { dayLabel } from '../dates'
import Icon from '../icons'
import { coverage, dueClause, headline, leadExam, outlook, todayLine, when } from '../plan'
import { plural } from '../plural'

/* The head of the dashboard: the nearest exam, what today holds for it in one line, the
   button that starts the work, and the course's other exams under it. Adding, moving or
   removing an exam replans the course on the server, so the page's other numbers are told
   to reload.

   dueToday is the course's due count, empty says whether the course has no concepts yet
   (null while the page is still finding out), start is the page's main button and children
   are the figures that sit under the buttons. */
export default function Exams({ courseId, onChange, dueToday = 0, empty = false, start, children }: {
  courseId: number
  onChange: () => void
  dueToday?: number
  empty?: boolean | null
  start?: ReactNode
  children?: ReactNode
}) {
  const [exams, setExams] = useState<Exam[] | null>(null)
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [error, setError] = useState<string | null>(null)
  // the exam whose form is open, 'new' for the add form, or null with no form open
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  // closing a form unmounts the control the caret sat on; the headline takes it
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

  // until the exams (and whether the course has anything in it) are known, a skeleton the
  // shape of what lands
  if ((exams === null && error === null) || empty === null) return <PlanSkeleton />

  const lead = exams ? leadExam(exams) : null
  const others = (exams ?? []).filter(exam => exam !== lead)
  // a new exam starts with the lectures no exam covers yet: the midterm takes what is uploaded,
  // and a later final takes what came after it
  const covered = new Set((exams ?? []).flatMap(exam => exam.lectureIds))

  const form = (exam: Exam) => (
    <ExamForm lectures={lectures}
      initial={{ name: exam.name, date: exam.date, lectureIds: exam.lectureIds }}
      onSave={body => api.updateExam(exam.id, body).then(changed)}
      onDelete={() => api.deleteExam(exam.id).then(changed)}
      onCancel={close} setError={setError} />
  )

  return (
    <section className="plan" aria-labelledby="plan-title">
      {lead ? (
        <p className="plan-kicker">
          <Icon name="calendar" />
          <b>{lead.name}</b>
          <span>{dayLabel(lead.date)} · {when(lead)}</span>
          {editing === null && (
            <button className="btn btn--ghost btn--micro" aria-label={`Edit ${lead.name}`}
              onClick={() => setEditing(lead.id)}>Edit</button>
          )}
        </p>
      ) : exams && !empty && (
        <p className="plan-kicker"><Icon name="calendar" /><span>{exams.length === 0 ? 'No exam yet' : 'No exam ahead'}</span></p>
      )}
      <h2 id="plan-title" className="plan-title" tabIndex={-1} ref={heading}>{headline(lead, dueToday, empty)}</h2>
      {exams && <Lede lead={lead} exams={exams} lectureCount={lectures.length} dueToday={dueToday} empty={empty} />}
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="plan-actions">
        {start}
        {exams && editing === null && (
          <button className="btn btn--secondary btn--go" onClick={() => setEditing('new')}>Add an exam</button>
        )}
      </div>
      {editing === 'new' && (
        <ExamForm lectures={lectures}
          initial={{ name: '', date: '', lectureIds: lectures.filter(l => !covered.has(l.id)).map(l => l.id) }}
          onSave={body => api.createExam(courseId, body).then(changed)}
          onCancel={close} setError={setError} />
      )}
      {lead && editing === lead.id && form(lead)}
      {children}
      {others.length > 0 && (
        <div className="other-exams">
          <h3>{lead ? 'Other exams' : 'Past exams'}</h3>
          <ul className="exam-list">
            {others.map(exam => (
              <li key={exam.id} className={`exam exam--${exam.status}`}>
                {editing === exam.id ? form(exam) : (
                  <>
                    <div className="exam-head">
                      <p className="exam-name">{exam.name}</p>
                      <p className="exam-when">{dayLabel(exam.date)} · {when(exam)}</p>
                      {editing === null && (
                        <button className="btn btn--ghost btn--micro" aria-label={`Edit ${exam.name}`}
                          onClick={() => setEditing(exam.id)}>Edit</button>
                      )}
                    </div>
                    {exam.plan ? (
                      <p className="exam-outlook">
                        {todayLine(exam.plan)}. {outlook(exam.plan)} {coverage(exam, lectures.length)}
                      </p>
                    ) : (
                      <p className="exam-outlook">{exam.status === 'today' ? 'The exam is today.' : 'This exam has passed.'}</p>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/* the line under the headline: how the day's work adds up, and how the plan runs to the exam */
function Lede({ lead, exams, lectureCount, dueToday, empty }: {
  lead: Exam | null
  exams: Exam[]
  lectureCount: number
  dueToday: number
  empty: boolean
}) {
  if (empty) {
    return <p className="lede plan-lede">Upload a lecture PDF in the bank. Its concepts show up here, and an exam paces each day's topics to its date.</p>
  }
  if (!lead) {
    return (
      <p className="lede plan-lede">
        {exams.length === 0
          ? 'Add an exam and each day\'s topics are paced to its date: a few a day while it is far off, more as it gets close.'
          : 'Every exam here has passed. Add the next one and each day\'s topics are paced to its date.'}
      </p>
    )
  }
  const due = dueClause(lead, dueToday)
  return (
    <p className="lede plan-lede">
      {due.kind === 'sum' && <>That makes <b>{due.due} due today</b>. </>}
      {due.kind === 'course' && <><b>{due.due} due today</b> across the course. </>}
      {lead.plan && <>{outlook(lead.plan)} {coverage(lead, lectureCount)}</>}
    </p>
  )
}

/* the head's shape while the exams load: kicker, headline, lede, buttons, figures */
function PlanSkeleton() {
  return (
    <div className="plan" aria-busy="true">
      <span className="visually-hidden">Loading the exam plan…</span>
      <span className="skeleton plan-sk-kicker" />
      <span className="skeleton plan-sk-title" />
      <span className="skeleton plan-sk-line" />
      <span className="skeleton plan-sk-line plan-sk-line--short" />
      <span className="skeleton plan-sk-button" />
      <span className="skeleton plan-sk-figs" />
    </div>
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
