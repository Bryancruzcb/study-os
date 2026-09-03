import { useCallback, useEffect, useState } from 'react'
import { api, type Attempt, type Course, type StudyQuestion } from '../api'

export default function StudyPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [courseId, setCourseId] = useState<number | null>(null)
  const [question, setQuestion] = useState<StudyQuestion | null>(null)
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (cid: number) => {
    setError(null)
    try {
      const q = await api.next(cid)
      setQuestion(q)
      setAttempt(null)
      setDone(q === null)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  useEffect(() => {
    api.courses().then(cs => {
      setCourses(cs)
      if (cs.length > 0) {
        setCourseId(cs[0].id)
        load(cs[0].id)
      }
    }).catch(e => setError(String(e)))
  }, [load])

  async function submit(call: () => Promise<Attempt>) {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      setAttempt(await call())
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  function answerMc(index: number) {
    if (question) submit(() => api.answer({ questionId: question.id, answerIndex: index }))
  }

  function answerShort() {
    if (question) submit(async () => {
      const a = await api.answer({ questionId: question.id, answerText: text })
      setText('')
      return a
    })
  }

  return (
    <div>
      <h2>Study</h2>
      {error && <p role="alert">{error}</p>}
      <select value={courseId ?? ''} onChange={e => {
        const cid = Number(e.target.value)
        setCourseId(cid)
        load(cid)
      }}>
        {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {done && <p>Nothing due. Come back tomorrow.</p>}
      {question && (
        <div>
          <p>{question.prompt} <small>pp. {question.sourcePages}</small></p>
          {question.type === 'MC' && !attempt &&
            question.options.map((o, i) =>
              <button key={i} disabled={submitting} onClick={() => answerMc(i)}>{o}</button>)}
          {question.type === 'SHORT_ANSWER' && !attempt && (
            <div>
              <textarea value={text} disabled={submitting} onChange={e => setText(e.target.value)} />
              <button disabled={submitting} onClick={answerShort}>Submit</button>
            </div>
          )}
          {attempt && (
            <div>
              {attempt.verdict === 'PENDING' ? (
                <div>
                  <p>Grader unavailable — self-grade this one:</p>
                  <button disabled={submitting} onClick={() => submit(() => api.selfGrade(attempt.id, true))}>I got it right</button>
                  <button disabled={submitting} onClick={() => submit(() => api.selfGrade(attempt.id, false))}>I got it wrong</button>
                </div>
              ) : (
                <div>
                  <p>{attempt.verdict} {attempt.score != null && `(${attempt.score})`} {attempt.feedback && `— ${attempt.feedback}`}</p>
                  <button disabled={submitting} onClick={() => submit(() => api.override(attempt.id))}>
                    {attempt.verdict === 'INCORRECT' ? 'I was actually right' : 'I was actually wrong'}
                  </button>
                </div>
              )}
              <button disabled={submitting} onClick={() => courseId != null && load(courseId)}>Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
