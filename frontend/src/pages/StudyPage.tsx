import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useOutletContext } from 'react-router-dom'
import { api, type AnsweredAttempt, type Attempt, type StudyQuestion } from '../api'
import type { CourseContext } from '../shell/CourseLayout'

const LETTERS = 'ABCDEFGHIJ'
const letter = (i: number) => LETTERS[i] ?? String(i + 1)

export default function StudyPage() {
  const { course, refresh, slot } = useOutletContext<CourseContext>()
  const [question, setQuestion] = useState<StudyQuestion | null>(null)
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [answerKey, setAnswerKey] = useState<string | null>(null)
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
  // grading unmounts the control the caret sat on; the band takes it, so the next Tab
  // reaches its buttons rather than starting over from the top of the page
  const band = useRef<HTMLDivElement>(null)
  // a ref, not state: a one-shot command to put the caret on the next question once it
  // renders. Next question sets it; the mount load never does. The caret lands on the prompt,
  // not on the first option: Enter activates a button on keydown and repeats while held, so
  // a held or stuttered Enter on Next question would answer A the moment the card arrived,
  // and a screen reader would hear "1, button" with no question. From the prompt one Tab
  // reaches the first option, the textarea, or the empty queue's way to the bank
  const wantFirst = useRef(false)
  const landing = useRef<HTMLElement | null>(null)
  const takeLanding = useCallback((el: HTMLElement | null) => { landing.current = el }, [])

  useLayoutEffect(() => {
    if (attempt) band.current?.focus()
  }, [attempt])

  // after every render: waits for the load's finally so the caret lands on the card that
  // arrived, not on the one on its way out. A failed load leaves the command standing for
  // the question that does arrive
  useLayoutEffect(() => {
    if (!wantFirst.current || submitting) return
    const el = landing.current
    if (!el) return
    wantFirst.current = false
    el.focus()
  })

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
    setAnswerKey(null)
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

  function next() {
    wantFirst.current = true
    return load()
  }

  // every verdict moves the concept out of today's queue, so the head figure is stale after one
  function saveAttempt(call: () => Promise<Attempt>) {
    return run(async () => {
      setAttempt(await call())
      await refresh()
    })
  }

  function submitAnswer(call: () => Promise<AnsweredAttempt>) {
    return saveAttempt(async () => {
      const result = await call()
      setAnswerKey(result.answerKey)
      return result
    })
  }

  function answerMc(index: number) {
    if (!question) return
    setPicked(index)
    submitAnswer(() => api.answer({ questionId: question.id, answerIndex: index }))
  }

  function answerShort() {
    if (!question) return
    // trimmed on the way out for the same reason Submit is gated on the trim: the
    // padding is not part of the answer and it is billed and stored either way
    const answer = text.trim()
    submitAnswer(async () => {
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
          <p className="empty" tabIndex={-1} ref={takeLanding}>Nothing due. Come back tomorrow.</p>
          <Link className="btn btn--ghost" to="../bank">Open the bank</Link>
        </div>
      )}
      {question && (
        <article className="qcard-big">
          <div className="chips">
            <span className="chip">{question.type === 'MC' ? 'Multiple choice' : 'Short answer'}</span>
            {question.sourcePages && <span className="chip chip--mono">pp. {question.sourcePages}</span>}
          </div>
          <p className="prompt" tabIndex={-1} ref={takeLanding}>{question.prompt}</p>
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
              <textarea className="textarea" aria-label="Your answer" value={text}
                disabled={submitting} onChange={e => setText(e.target.value)} />
              {/* a blank or whitespace-only answer still buys a real grader call and banks an attempt that drags the schedule */}
              <button className="btn" disabled={submitting || !text.trim()} onClick={answerShort}>Submit</button>
            </div>
          )}
          {attempt && (
            <>
              {submitted && <p className="your-answer">{submitted}</p>}
              {answerKey && attempt.verdict === 'PENDING' && (
                <details className="answer-review">
                  <summary>Check the answer before self-grading</summary>
                  <p className="answer-key"><span>Answer key</span>{answerKey}</p>
                </details>
              )}
              {attempt.verdict === 'PENDING' ? (
                <div ref={band} tabIndex={-1} className="verdict verdict--pending">
                  <p className="verdict-line">
                    <span className="bracket" aria-hidden="true" />
                    Grader unavailable. Self-grade this one:
                  </p>
                  <div className="actions">
                    <button className="btn btn--secondary" disabled={submitting}
                      onClick={() => saveAttempt(() => api.selfGrade(attempt.id, true))}>I got it right</button>
                    <button className="btn btn--secondary" disabled={submitting}
                      onClick={() => saveAttempt(() => api.selfGrade(attempt.id, false))}>I got it wrong</button>
                    <button className="btn" disabled={submitting} onClick={next}>Next question</button>
                  </div>
                </div>
              ) : (
                <div ref={band} tabIndex={-1}
                  className={`verdict ${attempt.verdict === 'CORRECT' ? 'verdict--ok' : 'verdict--bad'}`}>
                  <p className="verdict-line">
                    <span className="bracket" aria-hidden="true" />
                    {attempt.verdict === 'CORRECT' ? 'Correct' : 'Incorrect'}
                    {attempt.score != null && <span className="score">{attempt.score}</span>}
                  </p>
                  {picked != null && question.type === 'MC' && (
                    <p className="verdict-note">You picked {letter(picked)}: {question.options[picked]}</p>
                  )}
                  {attempt.feedback && <p className="verdict-note">Grader: {attempt.feedback}</p>}
                  {answerKey && (
                    <details className="answer-review" open={attempt.verdict === 'INCORRECT'}>
                      <summary>Check the answer</summary>
                      <p className="answer-key"><span>Answer key</span>{answerKey}</p>
                    </details>
                  )}
                  <div className="actions">
                    <button className="btn btn--secondary" disabled={submitting}
                      onClick={() => saveAttempt(() => api.override(attempt.id))}>
                      {attempt.verdict === 'INCORRECT' ? 'I was actually right' : 'I was actually wrong'}
                    </button>
                    <button className="btn" disabled={submitting} onClick={next}>Next question</button>
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
