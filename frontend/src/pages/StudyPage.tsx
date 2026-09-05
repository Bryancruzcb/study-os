import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useOutletContext } from 'react-router-dom'
import { api, type Attempt, type StudyQuestion } from '../api'
import type { CourseContext } from '../shell/CourseLayout'

const LETTERS = 'ABCDEFGHIJ'
const letter = (i: number) => LETTERS[i] ?? String(i + 1)

export default function StudyPage() {
  const { course, refresh, slot } = useOutletContext<CourseContext>()
  const [question, setQuestion] = useState<StudyQuestion | null>(null)
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // a ref, not the state: two clicks in one tick both read the pre-render value of `submitting`
  const inFlight = useRef(false)
  // what was due when the visit started, so the bar has a whole to fill against
  const [startOfVisit] = useState(course.dueToday)

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

  const load = useCallback(() => run(async () => {
    const q = await api.next(course.id)
    setQuestion(q)
    setAttempt(null)
    setPicked(null)
    setSubmitted('')
    setDone(q === null)
  }), [run, course.id])

  useEffect(() => {
    // the mount load goes through run() on purpose, to share the single-flight guard with
    // Next question; the setSubmitting(true) it triggers is one extra render before any
    // control exists, which is all the rule below is warning about
    // oxlint-disable-next-line react/set-state-in-effect
    load()
  }, [load])

  // every verdict moves the concept out of today's queue, so the head figure is stale after one
  function submit(call: () => Promise<Attempt>) {
    return run(async () => {
      setAttempt(await call())
      await refresh()
    })
  }

  function answerMc(index: number) {
    if (!question) return
    setPicked(index)
    submit(() => api.answer({ questionId: question.id, answerIndex: index }))
  }

  function answerShort() {
    if (!question) return
    // trimmed on the way out for the same reason Submit is gated on the trim: the
    // padding is not part of the answer and it is billed and stored either way
    const answer = text.trim()
    submit(async () => {
      const a = await api.answer({ questionId: question.id, answerText: answer })
      setSubmitted(answer)
      setText('')
      return a
    })
  }

  const left = course.dueToday
  const fill = startOfVisit === 0 ? null : Math.max(0, Math.min(100, Math.round((1 - left / startOfVisit) * 100)))

  return (
    <div className="study">
      {slot && createPortal(
        <div className="progress">
          <p className="figure"><b>{left}</b><span>left today</span></p>
          {fill != null && <div className="bar"><span style={{ width: `${fill}%` }} /></div>}
        </div>,
        slot,
      )}
      {error && <p className="alert" role="alert">{error}</p>}
      {done && (
        <div className="qcard-big">
          <p className="empty">Nothing due. Come back tomorrow.</p>
          <Link className="btn btn--ghost" to="../bank">Open the bank</Link>
        </div>
      )}
      {question && (
        <article className="qcard-big">
          <div className="chips">
            <span className="chip">{question.type === 'MC' ? 'Multiple choice' : 'Short answer'}</span>
            {question.sourcePages && <span className="chip chip--mono">pp. {question.sourcePages}</span>}
          </div>
          <p className="prompt">{question.prompt}</p>
          {question.type === 'MC' && !attempt && (
            <div className="opts">
              {question.options.map((o, i) => (
                <button className="opt" key={i} disabled={submitting} onClick={() => answerMc(i)}>
                  <span className="letter" aria-hidden="true">{letter(i)}</span>{o}
                </button>
              ))}
            </div>
          )}
          {question.type === 'SHORT_ANSWER' && !attempt && (
            <div className="short-answer">
              <textarea className="textarea" aria-label="Your answer" value={text} disabled={submitting}
                onChange={e => setText(e.target.value)} />
              {/* a blank or whitespace-only answer still buys a real grader call and banks an attempt that drags the schedule */}
              <button className="btn" disabled={submitting || !text.trim()} onClick={answerShort}>Submit</button>
            </div>
          )}
          {attempt && (
            <>
              {submitted && <p className="your-answer">{submitted}</p>}
              {attempt.verdict === 'PENDING' ? (
                <div className="verdict verdict--pending">
                  <p className="verdict-line">
                    <span className="bracket" aria-hidden="true" />
                    Grader unavailable. Self-grade this one:
                  </p>
                  <div className="actions">
                    <button className="btn btn--secondary" disabled={submitting}
                      onClick={() => submit(() => api.selfGrade(attempt.id, true))}>I got it right</button>
                    <button className="btn btn--secondary" disabled={submitting}
                      onClick={() => submit(() => api.selfGrade(attempt.id, false))}>I got it wrong</button>
                    <button className="btn" disabled={submitting} onClick={load}>Next question</button>
                  </div>
                </div>
              ) : (
                <div className={`verdict ${attempt.verdict === 'CORRECT' ? 'verdict--ok' : 'verdict--bad'}`}>
                  <p className="verdict-line">
                    <span className="bracket" aria-hidden="true" />
                    {attempt.verdict === 'CORRECT' ? 'Correct' : 'Incorrect'}
                    {attempt.score != null && <span className="score">{attempt.score}</span>}
                  </p>
                  {picked != null && question.type === 'MC' && (
                    <p className="verdict-note">You picked {letter(picked)}: {question.options[picked]}</p>
                  )}
                  {attempt.feedback && <p className="verdict-note">Grader: {attempt.feedback}</p>}
                  <div className="actions">
                    <button className="btn btn--secondary" disabled={submitting}
                      onClick={() => submit(() => api.override(attempt.id))}>
                      {attempt.verdict === 'INCORRECT' ? 'I was actually right' : 'I was actually wrong'}
                    </button>
                    <button className="btn" disabled={submitting} onClick={load}>Next question</button>
                  </div>
                </div>
              )}
            </>
          )}
        </article>
      )}
    </div>
  )
}
