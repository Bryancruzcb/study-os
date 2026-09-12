import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { plural } from '../plural'
import Atmosphere from '../shell/Atmosphere'
import Nav from '../shell/Nav'
import { dueSplit, useCourses } from '../shell/courses'

/* five washes cycle by id, so courses made one after the other never share one */
const WASHES = 5

export default function HomePage() {
  const { courses, error } = useCourses()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [term, setTerm] = useState('')
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const nameField = useRef<HTMLInputElement>(null)
  const newTile = useRef<HTMLButtonElement>(null)

  // the form is only reachable from the keyboard if opening it moves the caret inside,
  // and closing it has to hand the caret back rather than drop it on document.body
  const wasCreating = useRef(false)
  useLayoutEffect(() => {
    if (creating) {
      nameField.current?.focus()
      wasCreating.current = true
    } else if (wasCreating.current) {
      newTile.current?.focus()
      wasCreating.current = false
    }
  }, [creating])

  const list = courses ?? []
  const due = list.reduce((n, c) => n + c.dueToday, 0)
  const newest = list[list.length - 1]

  function openForm() {
    // term seeded from the newest course rather than a literal that goes stale in a year
    setName('')
    setTerm(newest?.term ?? '')
    setCreateError(null)
    setCreating(true)
  }

  function closeForm() {
    setCreating(false)
    setName('')
    setTerm('')
    // the failure belonged to the form, so it goes with it
    setCreateError(null)
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const n = name.trim()
    const t = term.trim()
    if (!n || !t || saving) return
    setSaving(true)
    setCreateError(null)
    try {
      const c = await api.createCourse(n, t)
      // an empty course has one useful next step, uploading a PDF, and that lives in the bank
      navigate(`/courses/${c.id}/bank`)
    } catch (err) {
      // the form stays open and keeps what was typed, so a failure costs a click
      setCreateError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const shown = error ?? createError

  return (
    <>
      <div className="band">
        <Atmosphere />
        <div className="wrap">
          <Nav />
          <header className="hero">
            {courses && courses.length > 0 && (
              <>
                <p className="eyebrow">{newest?.term} · {plural(courses.length, 'course')}</p>
                <h1>{due} due today.</h1>
                <p className="lede">{dueSplit(courses)}. Pick a class to start the queue.</p>
              </>
            )}
            {courses && courses.length === 0 && (
              <>
                <h1>No courses yet.</h1>
                <p className="lede">Add one below and upload a lecture PDF.</p>
              </>
            )}
          </header>
        </div>
      </div>
      <main className="wrap home">
        {shown && <p className="alert" role="alert">{shown}</p>}
        {!courses && !error && <p className="empty">Loading…</p>}
        {courses && (
          <section className="courses">
            <h2>Courses</h2>
            <div className="grid">
              {courses.map(c => (
                <Link key={c.id} className="tile" to={`/courses/${c.id}/study`}>
                  <span className={`tile-wash wash-${c.id % WASHES}`}>
                    <span className="tile-code">{c.name}</span>
                    <span className="tile-term">{c.term}</span>
                  </span>
                  <span className="tile-body">
                    <span className="figure"><b>{c.dueToday}</b><span>due today</span></span>
                    <span className="tile-counts">{plural(c.concepts, 'concept')} · {plural(c.questions, 'question')}</span>
                  </span>
                </Link>
              ))}
              {creating ? (
                /* in flight, Escape would tear down the form the create is about to land on */
                <form className="tile tile--form" onSubmit={onCreate}
                  onKeyDown={e => { if (e.key === 'Escape' && !saving) closeForm() }}>
                  <label className="field">
                    <span className="field-label">Name</span>
                    <input className="input" ref={nameField} value={name} disabled={saving}
                      onChange={e => setName(e.target.value)} />
                  </label>
                  <label className="field">
                    <span className="field-label">Term</span>
                    <input className="input" value={term} disabled={saving}
                      onChange={e => setTerm(e.target.value)} />
                  </label>
                  <span className="tile-form-actions">
                    <button className="btn btn--micro" type="submit"
                      disabled={saving || !name.trim() || !term.trim()}>Create</button>
                    <button className="btn btn--secondary btn--micro" type="button" disabled={saving}
                      onClick={closeForm}>Cancel</button>
                  </span>
                </form>
              ) : (
                <button ref={newTile} className="tile tile--new" type="button" onClick={openForm}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                    strokeWidth="1.8" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
                  New course
                </button>
              )}
            </div>
          </section>
        )}
      </main>
    </>
  )
}
