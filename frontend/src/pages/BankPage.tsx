import { useEffect, useState } from 'react'
import { api, type ConceptWithQuestions, type Course, type Question } from '../api'

interface LabelBody { answerable: boolean; correctAnswer: boolean; unambiguous: boolean }

export default function BankPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [courseId, setCourseId] = useState<number | null>(null)
  const [bank, setBank] = useState<ConceptWithQuestions[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.courses().then(cs => {
      setCourses(cs)
      if (cs.length > 0) setCourseId(cs[0].id)
    }).catch(e => setError(String(e)))
  }, [])

  useEffect(() => {
    if (courseId != null) api.bank(courseId).then(setBank).catch(e => setError(String(e)))
  }, [courseId])

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
    try {
      await api.retire(qid)
      if (courseId != null) setBank(await api.bank(courseId))
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

  async function onCreateCourse() {
    const name = prompt('Course name?')
    if (!name) return
    try {
      const c = await api.createCourse(name, 'Fall 2026')
      setCourses([...courses, c])
      setCourseId(c.id)
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h2 className="page-title">Question Bank</h2>
        <div className="toolbar">
          <select className="select" value={courseId ?? ''} onChange={e => setCourseId(Number(e.target.value))}>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="button button--secondary" onClick={onCreateCourse}>New course</button>
          <input className="file-input" type="file" accept="application/pdf" disabled={uploading}
            onChange={e => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) onUpload(file)
            }} />
        </div>
      </header>
      {error && <p className="alert" role="alert">{error}</p>}
      {uploading && <p className="empty">Ingesting… this takes a minute.</p>}
      <div className="bank">
        {bank.map(c => (
          <section className="concept" key={c.id}>
            <div className="concept-head">
              <h3 className="concept-name">{c.name}</h3>
              <small className="cite">pp. {c.sourcePages}</small>
            </div>
            <p className="concept-summary">{c.summary}</p>
            <ul className="qlist">
              {c.questions.map(q => (
                <li className={q.status === 'RETIRED' ? 'qrow qrow--retired' : 'qrow'} key={q.id}>
                  <div className="qbody">
                    <span className="qtype">[{q.type}]</span>
                    <span className="qprompt">{q.prompt}</span>
                    <small className="cite">pp. {q.sourcePages}</small>
                  </div>
                  <div className="qcontrols">
                    {/* keyed on the saved labels so a refreshed bank re-seeds the boxes */}
                    <LabelControl key={`${q.labelAnswerable}/${q.labelCorrectAnswer}/${q.labelUnambiguous}`}
                      question={q} onSave={onLabel} />
                    {q.status === 'ACTIVE' && (
                      <span className="qdanger">
                        <button className="button button--micro button--danger"
                          onClick={() => onRetire(q.id)}>retire</button>
                      </span>
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
