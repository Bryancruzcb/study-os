import { useEffect, useState } from 'react'
import { api, type ConceptWithQuestions, type Course } from '../api'

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
    <div>
      <h2>Question Bank</h2>
      {error && <p role="alert">{error}</p>}
      <select value={courseId ?? ''} onChange={e => setCourseId(Number(e.target.value))}>
        {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <button onClick={onCreateCourse}>New course</button>
      <input type="file" accept="application/pdf" disabled={uploading}
        onChange={e => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onUpload(file)
        }} />
      {uploading && <p>Ingesting… this takes a minute.</p>}
      {bank.map(c => (
        <section key={c.id}>
          <h3>{c.name} <small>pp. {c.sourcePages}</small></h3>
          <p>{c.summary}</p>
          <ul>
            {c.questions.map(q => (
              <li key={q.id} style={{ opacity: q.status === 'RETIRED' ? 0.4 : 1 }}>
                [{q.type}] <span>{q.prompt}</span> <small>pp. {q.sourcePages}</small>
                {q.status === 'ACTIVE' && <button onClick={() => onRetire(q.id)}>retire</button>}
                <LabelControl questionId={q.id} onSave={onLabel} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function LabelControl({ questionId, onSave }: { questionId: number; onSave: (qid: number, body: LabelBody) => Promise<boolean> }) {
  const [answerable, setAnswerable] = useState(true)
  const [correctAnswer, setCorrectAnswer] = useState(true)
  const [unambiguous, setUnambiguous] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  return (
    <span>
      <label><input type="checkbox" checked={answerable} disabled={saving} onChange={e => { setAnswerable(e.target.checked); setSaved(false) }} />answerable</label>
      <label><input type="checkbox" checked={correctAnswer} disabled={saving} onChange={e => { setCorrectAnswer(e.target.checked); setSaved(false) }} />correct</label>
      <label><input type="checkbox" checked={unambiguous} disabled={saving} onChange={e => { setUnambiguous(e.target.checked); setSaved(false) }} />unambiguous</label>
      <button disabled={saving} onClick={async () => {
        setSaving(true)
        const ok = await onSave(questionId, { answerable, correctAnswer, unambiguous })
        setSaving(false)
        setSaved(ok)
      }}>{saved ? 'labeled ✓' : 'label'}</button>
    </span>
  )
}
