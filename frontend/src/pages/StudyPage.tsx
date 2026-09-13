import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { Link, useOutletContext } from 'react-router-dom'
import { api, type AnsweredAttempt, type Attempt, type StudyQuestion } from '../api'
import type { CourseContext } from '../shell/CourseLayout'
import QuestionHead from './QuestionHead'

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

/* the visit with one card's attempt replaced: an answered card's, or the question on the
   table's when `card` is null */
function withAttempt(visit: Visit, card: number | null, attempt: Attempt): Visit {
  if (card === null) return visit.live ? { ...visit, live: { ...visit.live, attempt } } : visit
  return { ...visit, answered: visit.answered.map((c, i) => (i === card ? { ...c, attempt } : c)) }
}

/* Whether an answered card's verdict can still change. The backend only overrides or
   self-grades a concept's most recent attempt, the only one whose schedule change it can
   still undo, so answering the same concept again later in the visit makes this one final. */
function stillOpen(visit: Visit, card: number): boolean {
  const concept = visit.answered[card].question.conceptId
  const answeredAgain = visit.answered.slice(card + 1).some(c => c.question.conceptId === concept)
    || (visit.live?.attempt != null && visit.live.question.conceptId === concept)
  return !answeredAgain
}

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
  // a one-shot command, set by every saved verdict, to put the caret on the band once it
  // renders: on the question on the table, or on a card looked back on. A step through the
  // visit changes which attempt is on screen too, and must not take the caret with it
  const wantBand = useRef(false)
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
    if (!wantBand.current) return
    const el = band.current
    if (!el) return
    wantBand.current = false
    el.focus()
  })

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

  // the answer, the pick and the key only ever arrive on the question on the table
  function updateLive(change: Partial<Card>) {
    setVisit(v => (v.live ? { ...v, live: { ...v.live, ...change } } : v))
  }

  // every verdict moves the concept out of today's queue, so the head figure is stale after
  // one. `card` is the answered card being changed, or null for the question on the table
  function saveAttempt(call: () => Promise<Attempt>, card: number | null = null) {
    return run(async () => {
      const saved = await call()
      setVisit(v => withAttempt(v, card, saved))
      wantBand.current = true
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
  const past = back === null ? null : { index: back, card: visit.answered[back] }

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
      {past && (
        <article className="qcard-big" key={past.index}>
          <QuestionHead question={past.card.question} landing={takeLanding} />
          {stillOpen(visit, past.index) ? (
            <Outcome card={past.card} band={band} actions={
              <Changes attempt={past.card.attempt} submitting={submitting}
                save={call => saveAttempt(call, past.index)} />
            } />
          ) : (
            <Outcome card={past.card} band={band} final actions={
              <p className="verdict-note">You answered this concept again later in the visit, so this verdict is final.</p>
            } />
          )}
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
          <QuestionHead question={live.question} landing={takeLanding} />
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
            <Outcome card={{ ...live, attempt }} band={band} actions={
              <Changes attempt={attempt} submitting={submitting} save={call => saveAttempt(call)}>
                <button className="btn" disabled={submitting} onClick={next}>Next question</button>
              </Changes>
            } />
          )}
        </article>
      )}
    </div>
  )
}

/* How an answered question went: the answer as sent, the verdict and the key, with the
   controls that can still change it. A final verdict, whose concept was answered again
   later in the visit, carries a note where the controls would be */
function Outcome({ card, band, actions, final = false }: {
  card: AnsweredCard
  band: Ref<HTMLDivElement>
  actions: ReactNode
  final?: boolean
}) {
  const { question, attempt, answerKey, picked, submitted } = card
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
          {review(final ? 'Check the answer' : 'Check the answer before self-grading')}
          <div ref={band} tabIndex={-1} className="verdict verdict--pending">
            <p className="verdict-line">
              <span className="bracket" aria-hidden="true" />
              {final ? 'Grader unavailable, and never self-graded.' : 'Grader unavailable. Self-grade this one:'}
            </p>
            {actions}
          </div>
        </>
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
          {review('Check the answer', attempt.verdict === 'INCORRECT')}
          {actions}
        </div>
      )}
    </>
  )
}

/* the controls that change a verdict: reverse an automatic grade, or grade a pending one
   yourself. The question on the table adds its way on to the next one */
function Changes({ attempt, submitting, save, children }: {
  attempt: Attempt
  submitting: boolean
  save: (call: () => Promise<Attempt>) => void
  children?: ReactNode
}) {
  return attempt.verdict === 'PENDING' ? (
    <div className="actions">
      <button className="btn btn--secondary" disabled={submitting}
        onClick={() => save(() => api.selfGrade(attempt.id, true))}>I got it right</button>
      <button className="btn btn--secondary" disabled={submitting}
        onClick={() => save(() => api.selfGrade(attempt.id, false))}>I got it wrong</button>
      {children}
    </div>
  ) : (
    <div className="actions">
      <button className="btn btn--secondary" disabled={submitting}
        onClick={() => save(() => api.override(attempt.id))}>
        {attempt.verdict === 'INCORRECT' ? 'I was actually right' : 'I was actually wrong'}
      </button>
      {children}
    </div>
  )
}
