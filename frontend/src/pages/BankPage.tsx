import { useEffect, useState } from 'react'
import { api, type ConceptWithQuestions, type Course } from '../api'

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
      await api.upload(courseId, file)
      setBank(await api.bank(courseId))
    } catch (e) {
      setError(String(e))
    } finally {
      setUploading(false)
    }
  }

  async function onRetire(qid: number) {
    await api.retire(qid)
    if (courseId != null) setBank(await api.bank(courseId))
  }

  async function onCreateCourse() {
    const name = prompt('Course name?')
    if (!name) return
    const c = await api.createCourse(name, 'Fall 2026')
    setCourses([...courses, c])
    setCourseId(c.id)
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
        onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])} />
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
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
