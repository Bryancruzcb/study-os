import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { Link, useOutletContext } from 'react-router-dom'
import { api, type AnsweredAttempt, type Attempt, type StudyQuestion } from '../api'
import type { CourseContext } from '../shell/CourseLayout'

const LETTERS = 'ABCDEFGHIJ'
const letter = (i: number) => LETTERS[i] ?? String(i + 1)

/* a question as this visit met it: what was asked and, once answered, how it went */
interface Card {
  question: StudyQuestion
  attempt: Attempt | null
  answerKey: string | null
  // the option clicked, for the verdict's "You picked"
  picked: number | null
  // the short answer as it was sent
  submitted: string
}

type AnsweredCard = Card & { attempt: Attempt }

/* The visit so far, for one course: the questions answered and moved on from, oldest
   first, then the one on the table, or none once the queue has run out. */
interface Visit {
  courseId: number
  answered: AnsweredCard[]
  live: Card | null
  done: boolean
}

const unanswered = (question: StudyQuestion): Card =>
  ({ question, attempt: null, answerKey: null, picked: null, submitted: '' })

export default function StudyPage() {
  const { course, refresh, slot } = useOutletContext<CourseContext>()
  const [visit, setVisit] = useState<Visit>({ courseId: course.id, answered: [], live: null, done: false })
  // the answered card on screen while looking back; null is the question on the table
  const [back, setBack] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // a ref, not the state: two clicks in one tick both read the pre-render value of `submitting`
  const inFlight = useRef(false)
  // what was due when the visit started, so the bar has a whole to fill against
  const [startOfVisit] = useState(course.dueToday)
  // grading unmounts the control the caret sat on; the band takes it, so the next Tab
  // reaches its buttons rather than starting over from the top of the page
  const band = useRef<HTMLDivElement>(null)
  // a ref, not state: a one-shot command to put the caret on the next card once it renders.
  // Next question sets it, and so does a step back or forward that disables its own button;
  // the mount load never does. The caret lands on the prompt, not on the first option: Enter
  // activates a button on keydown and repeats while held, so a held or stuttered Enter on
  // Next question would answer A the moment the card arrived, and a screen reader would hear
  // "1, button" with no question. From the prompt one Tab reaches the first option, the
  // textarea, or the empty queue's way to the bank
  const wantFirst = useRef(false)
  const landing = useRef<HTMLElement | null>(null)
  const takeLanding = useCallback((el: HTMLElement | null) => { landing.current = el }, [])

  const live = visit.live
  const attempt = live?.attempt ?? null

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
    // the question just left joins what can be looked back on, unless the visit belongs to
    // another course: this page stays mounted when the history moves between two courses
    setVisit(v => ({
      courseId: course.id,
      answered: v.courseId !== course.id ? []
        : v.live?.attempt ? [...v.answered, { ...v.live, attempt: v.live.attempt }]
        : v.answered,
      live: q ? unanswered(q) : null,
      done: q === null,
    }))
    setBack(null)
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

  // the question on the table is the only card that ever changes
  function updateLive(change: Partial<Card>) {
    setVisit(v => (v.live ? { ...v, live: { ...v.live, ...change } } : v))
  }

  // every verdict moves the concept out of today's queue, so the head figure is stale after one
  function saveAttempt(call: () => Promise<Attempt>) {
    return run(async () => {
      const saved = await call()
      updateLive({ attempt: saved })
      await refresh()
    })
  }

  function submitAnswer(call: () => Promise<AnsweredAttempt>) {
    return saveAttempt(async () => {
      const result = await call()
      updateLive({ answerKey: result.answerKey })
      return result
    })
  }

  function answerMc(index: number) {
    if (!live) return
    const question = live.question
    updateLive({ picked: index })
    submitAnswer(() => api.answer({ questionId: question.id, answerIndex: index }))
  }

  function answerShort() {
    if (!live) return
    const question = live.question
    // trimmed on the way out for the same reason Submit is gated on the trim: the
    // padding is not part of the answer and it is billed and stored either way
    const answer = text.trim()
    submitAnswer(async () => {
      const a = await api.answer({ questionId: question.id, answerText: answer })
      updateLive({ submitted: answer })
      setText('')
      return a
    })
  }

  // the visit's positions: every answered card, then the question on the table or the
  // empty queue
  const total = visit.answered.length + 1
  const at = back ?? visit.answered.length

  function step(to: number) {
    // a step to either end disables the button that took it, which would drop the caret on
    // the page, so the card that arrived takes it instead
    if (to === 0 || to === total - 1) wantFirst.current = true
    setBack(to === total - 1 ? null : to)
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
      {visit.answered.length > 0 && (
        <div className="study-nav" role="group" aria-label="Questions this visit">
          <button className="btn btn--secondary btn--micro" disabled={submitting || at === 0}
            onClick={() => step(at - 1)}>Previous</button>
          <span className="count" aria-live="polite">{at + 1} of {total}</span>
          <button className="btn btn--secondary btn--micro" disabled={submitting || at === total - 1}
            onClick={() => step(at + 1)}>Next</button>
        </div>
      )}
      {back !== null && (
        <article className="qcard-big" key={back}>
          <Head question={visit.answered[back].question} landing={takeLanding} />
          <Outcome card={visit.answered[back]} />
        </article>
      )}
      {back === null && visit.done && (
        <div className="qcard-big">
          <p className="empty" tabIndex={-1} ref={takeLanding}>Nothing due. Come back tomorrow.</p>
          <Link className="btn btn--ghost" to="../bank">Open the bank</Link>
        </div>
      )}
      {back === null && live && (
        <article className="qcard-big">
          <Head question={live.question} landing={takeLanding} />
          {live.question.type === 'MC' && !attempt && (
            <div className="opts">
              {live.question.options.map((o, i) => (
                <button className="opt" key={i} disabled={submitting} onClick={() => answerMc(i)}>
                  <span className="letter" aria-hidden="true">{letter(i)}</span>{o}
                </button>
              ))}
            </div>
          )}
          {live.question.type === 'SHORT_ANSWER' && !attempt && (
            <div className="short-answer">
              <textarea className="textarea" aria-label="Your answer" value={text}
                disabled={submitting} onChange={e => setText(e.target.value)} />
              {/* a blank or whitespace-only answer still buys a real grader call and banks an attempt that drags the schedule */}
              <button className="btn" disabled={submitting || !text.trim()} onClick={answerShort}>Submit</button>
            </div>
          )}
          {attempt && (
            <Outcome card={{ ...live, attempt }} band={band} actions={attempt.verdict === 'PENDING' ? (
              <div className="actions">
                <button className="btn btn--secondary" disabled={submitting}
                  onClick={() => saveAttempt(() => api.selfGrade(attempt.id, true))}>I got it right</button>
                <button className="btn btn--secondary" disabled={submitting}
                  onClick={() => saveAttempt(() => api.selfGrade(attempt.id, false))}>I got it wrong</button>
                <button className="btn" disabled={submitting} onClick={next}>Next question</button>
              </div>
            ) : (
              <div className="actions">
                <button className="btn btn--secondary" disabled={submitting}
                  onClick={() => saveAttempt(() => api.override(attempt.id))}>
                  {attempt.verdict === 'INCORRECT' ? 'I was actually right' : 'I was actually wrong'}
                </button>
                <button className="btn" disabled={submitting} onClick={next}>Next question</button>
              </div>
            )} />
          )}
        </article>
      )}
    </div>
  )
}

function Head({ question, landing }: { question: StudyQuestion; landing: (el: HTMLElement | null) => void }) {
  return (
    <>
      <div className="chips">
        <span className="chip">{question.type === 'MC' ? 'Multiple choice' : 'Short answer'}</span>
        {question.sourcePages && <span className="chip chip--mono">pp. {question.sourcePages}</span>}
      </div>
      <p className="prompt" tabIndex={-1} ref={landing}>{question.prompt}</p>
    </>
  )
}

/* How an answered question went: the answer as sent, the verdict, and the key. The question
   on the table passes its actions and takes the band's ref. A question looked back on gets
   neither: an override is only ever a disagreement noticed in the moment, which is what the
   agreement number counts, and a self-grade only moves the concept's latest attempt */
function Outcome({ card, band, actions }: { card: AnsweredCard; band?: Ref<HTMLDivElement>; actions?: ReactNode }) {
  const { question, attempt, answerKey, picked, submitted } = card
  const onTheTable = actions !== undefined
  const review = (summary: string, open?: boolean) => answerKey && (
    <details className="answer-review" open={open}>
      <summary>{summary}</summary>
      <p className="answer-key"><span>Answer key</span>{answerKey}</p>
    </details>
  )

  return (
    <>
      {submitted && <p className="your-answer">{submitted}</p>}
      {attempt.verdict === 'PENDING' ? (
        <>
          {review(onTheTable ? 'Check the answer before self-grading' : 'Check the answer')}
          <div ref={band} tabIndex={band ? -1 : undefined} className="verdict verdict--pending">
            <p className="verdict-line">
              <span className="bracket" aria-hidden="true" />
              {onTheTable ? 'Grader unavailable. Self-grade this one:' : 'Grader unavailable, and never self-graded.'}
            </p>
            {actions}
          </div>
        </>
      ) : (
        <div ref={band} tabIndex={band ? -1 : undefined}
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
          {review('Check the answer', attempt.verdict === 'INCORRECT')}
          {actions}
        </div>
      )}
    </>
  )
}
