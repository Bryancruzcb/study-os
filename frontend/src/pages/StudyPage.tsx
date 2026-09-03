import { useCallback, useEffect, useRef, useState } from 'react'
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
  // a ref, not the state: two clicks in one tick both read the pre-render value of `submitting`
  const inFlight = useRef(false)

  // every call that talks to the API goes through here, so only one is ever in flight
  const run = useCallback(async (work: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true
    setSubmitting(true)
    setError(null)
    try {
      await work()
    } catch (e) {
      setError(String(e))
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }, [])

  const load = useCallback((cid: number) => run(async () => {
    const q = await api.next(cid)
    setQuestion(q)
    setAttempt(null)
    setDone(q === null)
  }), [run])

  useEffect(() => {
    api.courses().then(cs => {
      setCourses(cs)
      if (cs.length > 0) {
        setCourseId(cs[0].id)
        load(cs[0].id)
      }
    }).catch(e => setError(String(e)))
  }, [load])

  function submit(call: () => Promise<Attempt>) {
    return run(async () => setAttempt(await call()))
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
    <div className="page">
      <header className="page-head">
        <h2 className="page-title">Study</h2>
        <div className="toolbar">
          <select className="select" value={courseId ?? ''} disabled={submitting} onChange={e => {
            const cid = Number(e.target.value)
            setCourseId(cid)
            load(cid)
          }}>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </header>
      {error && <p className="alert" role="alert">{error}</p>}
      {done && <p className="empty">Nothing due. Come back tomorrow.</p>}
      {question && (
        <div className="study">
          <div className="study-question">
            <p className="study-prompt">{question.prompt}</p>
            <small className="cite">pp. {question.sourcePages}</small>
          </div>
          {question.type === 'MC' && !attempt && (
            <div className="options">
              {question.options.map((o, i) =>
                <button className="button button--option" key={i} disabled={submitting}
                  onClick={() => answerMc(i)}>{o}</button>)}
            </div>
          )}
          {question.type === 'SHORT_ANSWER' && !attempt && (
            <div className="short-answer">
              <textarea className="textarea" value={text} disabled={submitting} onChange={e => setText(e.target.value)} />
              <button className="button" disabled={submitting} onClick={answerShort}>Submit</button>
            </div>
          )}
          {attempt && (
            <div className="result">
              {attempt.verdict === 'PENDING' ? (
                <>
                  <p className="result-line status status--review">
                    <span className="status-bracket" aria-hidden="true" />
                    Grader unavailable — self-grade this one:
                  </p>
                  <div className="result-actions">
                    <button className="button button--secondary" disabled={submitting} onClick={() => submit(() => api.selfGrade(attempt.id, true))}>I got it right</button>
                    <button className="button button--secondary" disabled={submitting} onClick={() => submit(() => api.selfGrade(attempt.id, false))}>I got it wrong</button>
                  </div>
                </>
              ) : (
                <>
                  <p className={`result-line status status--${attempt.verdict === 'CORRECT' ? 'clear' : 'blocked'}`}>
                    <span className="status-bracket" aria-hidden="true" />
                    <span className="status-mark">{attempt.verdict}</span>
                    {attempt.score != null && <span className="result-score">{`(${attempt.score})`}</span>}
                  </p>
                  {attempt.feedback && <p className="result-note">Grader: {attempt.feedback}</p>}
                  <div className="result-actions">
                    <button className="button button--secondary" disabled={submitting} onClick={() => submit(() => api.override(attempt.id))}>
                      {attempt.verdict === 'INCORRECT' ? 'I was actually right' : 'I was actually wrong'}
                    </button>
                  </div>
                </>
              )}
              <div className="result-actions">
                <button className="button" disabled={submitting} onClick={() => courseId != null && load(courseId)}>Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
