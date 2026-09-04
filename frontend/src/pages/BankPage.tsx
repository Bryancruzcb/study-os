import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { api, type ConceptWithQuestions, type Course, type Question } from '../api'

interface LabelBody { answerable: boolean; correctAnswer: boolean; unambiguous: boolean }

export default function BankPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [courseId, setCourseId] = useState<number | null>(null)
  const [bank, setBank] = useState<ConceptWithQuestions[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // the question whose retire is armed, or null. one at a time, so arming a row takes
  // the arming away from whichever row held it and only one confirm is ever on screen
  const [armed, setArmed] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTerm, setNewTerm] = useState('')
  const [savingCourse, setSavingCourse] = useState(false)
  const nameField = useRef<HTMLInputElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const newCourseButton = useRef<HTMLButtonElement>(null)
  // the danger cell's button per question, so the caret can be put back on the row it
  // was working when confirm, cancel or restore unmounts the control it was sitting on
  const dangerButtons = useRef(new Map<number, HTMLButtonElement | null>())
  // a ref, not state: this is a one-shot command to the DOM after the next render, and
  // holding it in state would mean an extra render just to clear it again
  const pendingFocus = useRef<number | null>(null)

  useEffect(() => {
    api.courses().then(cs => {
      setCourses(cs)
      if (cs.length > 0) setCourseId(cs[0].id)
    }).catch(e => setError(String(e)))
  }, [])

  useEffect(() => {
    if (courseId != null) api.bank(courseId).then(setBank).catch(e => setError(String(e)))
  }, [courseId])

  // the form is only reachable from the keyboard if opening it moves the caret inside,
  // and closing it has to hand the caret back rather than drop it on document.body
  const wasCreating = useRef(false)
  useLayoutEffect(() => {
    if (creating) {
      nameField.current?.focus()
      wasCreating.current = true
    } else if (wasCreating.current) {
      newCourseButton.current?.focus()
      wasCreating.current = false
    }
  }, [creating])

  // an armed row holds focus on cancel rather than on the confirm that took retire's
  // place, so the repeat of a held Enter, or a stuttered second press, disarms the row
  // instead of retiring on a key the user only meant to press once
  useLayoutEffect(() => {
    if (armed != null) cancelButton.current?.focus()
  }, [armed])

  // runs after whichever render the handler queued, so the caret lands on whatever the
  // cell now holds rather than on document.body, which is where a keyboard pass down the
  // bank ends up when the button under it is unmounted
  useLayoutEffect(() => {
    const id = pendingFocus.current
    if (id == null) return
    pendingFocus.current = null
    dangerButtons.current.get(id)?.focus()
  })

  async function onUpload(file: File) {
    if (courseId == null) return
    setUploading(true)
    setError(null)
    try {
      const m = await api.upload(courseId, file)
      if (m.status === 'FAILED') setError(m.errorMessage ?? 'Ingest failed')
      setBank(await api.bank(courseId))
    } catch (e) {
      setError(String(e))
    } finally {
      setUploading(false)
    }
  }

  async function onRetire(qid: number) {
    // disarming first means a second click of an accidental double lands on the empty
    // left half of a danger cell that keeps its width, so it lands on no control at all
    setArmed(null)
    setError(null)
    try {
      await api.retire(qid)
      if (courseId != null) setBank(await api.bank(courseId))
      pendingFocus.current = qid
    } catch (e) {
      setError(String(e))
    }
  }

  async function onRestore(qid: number) {
    setError(null)
    try {
      await api.restore(qid)
      if (courseId != null) setBank(await api.bank(courseId))
      pendingFocus.current = qid
    } catch (e) {
      setError(String(e))
    }
  }

  async function onLabel(qid: number, body: LabelBody) {
    setError(null)
    try {
      await api.label(qid, body)
      return true
    } catch (e) {
      setError(String(e))
      return false
    }
  }

  function openCourseForm() {
    // term is seeded from the course in view rather than written into the JSX, where a
    // literal would still say Fall 2026 a year from now
    setNewName('')
    setNewTerm(courses.find(c => c.id === courseId)?.term ?? '')
    setCreating(true)
  }

  function closeCourseForm() {
    setCreating(false)
    setNewName('')
    setNewTerm('')
  }

  async function onCreateCourse(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newName.trim()
    const term = newTerm.trim()
    if (!name || !term || savingCourse) return
    setSavingCourse(true)
    setError(null)
    try {
      const c = await api.createCourse(name, term)
      setCourses([...courses, c])
      setCourseId(c.id)
      closeCourseForm()
    } catch (err) {
      // the form stays open and keeps what was typed, so a failure costs a click
      setError(String(err))
    } finally {
      setSavingCourse(false)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h2 className="page-title">Question Bank</h2>
        <div className="toolbar">
          <select className="select" value={courseId ?? ''} onChange={e => {
            // question ids come from one sequence, so a stale arming matches no row in
            // the new bank, but it would still name a question that is off screen
            setArmed(null)
            setCourseId(Number(e.target.value))
          }}>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button ref={newCourseButton} className="button button--secondary"
            disabled={creating} onClick={openCourseForm}>New course</button>
          {/* the extension keeps a .pptx out of the default picker; the mime type alone
              does not, because the OS file dialog matches on either */}
          <input className="file-input" type="file" accept=".pdf,application/pdf" disabled={uploading}
            onChange={e => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) onUpload(file)
            }} />
          <small className="hint">PDF only</small>
        </div>
      </header>
      {error && <p className="alert" role="alert">{error}</p>}
      {creating && (
        <form className="course-form" onSubmit={onCreateCourse}
          onKeyDown={e => { if (e.key === 'Escape') closeCourseForm() }}>
          <label className="field">
            <span className="field-label">Name</span>
            <input className="input" ref={nameField} value={newName} disabled={savingCourse}
              onChange={e => setNewName(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Term</span>
            <input className="input" value={newTerm} disabled={savingCourse}
              onChange={e => setNewTerm(e.target.value)} />
          </label>
          <button className="button" type="submit"
            disabled={savingCourse || !newName.trim() || !newTerm.trim()}>Create</button>
          <button className="button button--secondary" type="button" disabled={savingCourse}
            onClick={closeCourseForm}>Cancel</button>
        </form>
      )}
      {uploading && <p className="empty">Ingesting… this takes a minute.</p>}
      <div className="bank">
        {bank.map(c => (
          <section className="concept" key={c.id}>
            <div className="concept-head">
              <h3 className="concept-name">{c.name}</h3>
              {c.sourcePages && <small className="cite">pp. {c.sourcePages}</small>}
            </div>
            <p className="concept-summary">{c.summary}</p>
            <ul className="qlist">
              {c.questions.map(q => (
                <li className={q.status === 'RETIRED' ? 'qrow qrow--retired' : 'qrow'} key={q.id}>
                  <div className="qbody">
                    <span className="qtype">[{q.type}]</span>
                    <span className="qprompt">{q.prompt}</span>
                    {q.sourcePages && <small className="cite">pp. {q.sourcePages}</small>}
                  </div>
                  <div className="qcontrols">
                    {/* keyed on the saved labels so a refreshed bank re-seeds the boxes */}
                    <LabelControl key={`${q.labelAnswerable}/${q.labelCorrectAnswer}/${q.labelUnambiguous}`}
                      question={q} onSave={onLabel} />
                  </div>
                  <div className="qdanger">
                    {q.status === 'RETIRED' ? (
                      <button key="restore" ref={el => { dangerButtons.current.set(q.id, el) }}
                        className="button button--micro button--secondary"
                        onClick={() => onRestore(q.id)}>restore</button>
                    ) : armed === q.id ? (
                      <>
                        {/* keyed apart from retire and restore, which is not decoration:
                            an unkeyed fragment reconciles child-for-child by position, so
                            confirm inherits retire's host node and the focus sitting on it,
                            and a held Enter retires on a key pressed once. Verified by
                            deleting the keys and watching the focus tests flip */}
                        <button key="confirm" className="button button--micro button--danger"
                          onClick={() => onRetire(q.id)}>confirm</button>
                        {/* cancel goes last because the cell is pinned to the row's right
                            edge: it occupies the pixels retire just gave up, so the second
                            click of an accidental double cancels rather than confirms */}
                        <button key="cancel" ref={cancelButton} className="button button--micro button--secondary"
                          onClick={() => { setArmed(null); pendingFocus.current = q.id }}>cancel</button>
                      </>
                    ) : (
                      <button key="retire" ref={el => { dangerButtons.current.set(q.id, el) }}
                        className="button button--micro button--danger"
                        onClick={() => setArmed(q.id)}>retire</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function LabelControl({ question, onSave }: { question: Question; onSave: (qid: number, body: LabelBody) => Promise<boolean> }) {
  // an unlabelled question comes back with all three null: default those to checked, but never
  // default over a stored false, or re-saving would overwrite the label the eval report counts
  const wasLabelled = question.labelAnswerable != null || question.labelCorrectAnswer != null || question.labelUnambiguous != null
  const [answerable, setAnswerable] = useState(question.labelAnswerable ?? true)
  const [correctAnswer, setCorrectAnswer] = useState(question.labelCorrectAnswer ?? true)
  const [unambiguous, setUnambiguous] = useState(question.labelUnambiguous ?? true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(wasLabelled)
  return (
    <span className="qlabels">
      <label className="check"><input type="checkbox" checked={answerable} disabled={saving} onChange={e => { setAnswerable(e.target.checked); setSaved(false) }} />answerable</label>
      <label className="check"><input type="checkbox" checked={correctAnswer} disabled={saving} onChange={e => { setCorrectAnswer(e.target.checked); setSaved(false) }} />correct</label>
      <label className="check"><input type="checkbox" checked={unambiguous} disabled={saving} onChange={e => { setUnambiguous(e.target.checked); setSaved(false) }} />unambiguous</label>
      <button className="button button--micro button--secondary" disabled={saving} onClick={async () => {
        setSaving(true)
        const ok = await onSave(question.id, { answerable, correctAnswer, unambiguous })
        setSaving(false)
        setSaved(ok)
      }}>{saved ? 'labeled ✓' : 'label'}</button>
    </span>
  )
}
