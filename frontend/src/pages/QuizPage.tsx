import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { Link, useOutletContext } from 'react-router-dom'
import { api, type QuestionReview, type QuizQuestion } from '../api'
import { plural } from '../plural'
import { asked, buildQuiz, byLecture, loadRun, saveRun, shuffle, tally, type QuizAnswer, type QuizRun } from '../quiz'
import type { CourseContext } from '../shell/CourseLayout'
import { citation } from '../source'
import Diagram from './Diagram'
import QuestionHead from './QuestionHead'

const LETTERS = 'ABCDEFGHIJ'
const letter = (i: number) => LETTERS[i] ?? String(i + 1)
// the shorter quizzes on offer, each shown only when the chosen lectures hold more questions than it asks
const LENGTHS = [50, 25, 10]

interface Lecture {
  id: number
  name: string
  questions: number
}

/* the course's lectures as the quiz sees them, from its questions, in lecture order */
function lecturesOf(questions: readonly QuizQuestion[]): Lecture[] {
  const lectures = new Map<number, Lecture>()
  for (const q of questions) {
    const lecture = lectures.get(q.lectureId) ?? { id: q.lectureId, name: q.lecture ?? `Lecture ${q.lectureId}`, questions: 0 }
    lecture.questions++
    lectures.set(q.lectureId, lecture)
  }
  return [...lectures.values()]
}

/* the right answer in words: the keyed option with its letter, or the model answer */
function keyText(question: QuizQuestion, review: QuestionReview): string {
  if (question.type === 'SHORT_ANSWER') return review.modelAnswer ?? 'No model answer.'
  const i = review.correctIndex
  return i != null && question.options[i] != null ? `${letter(i)}: ${question.options[i]}` : 'No answer key.'
}

/* Quiz mode: every question in the course, from every topic, shuffled into one quiz. After each
   answer the page shows why every option is right or wrong, drawn from the slides, with a diagram
   where one helps. A quiz is practice: nothing here records an attempt or moves a review date. The
   run lives in this browser, so leaving and coming back picks the quiz up where it stopped. */
export default function QuizPage() {
  const { course, slot } = useOutletContext<CourseContext>()
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [run, setRun] = useState<QuizRun | null>(() => loadRun(course.id))
  const [reviews, setReviews] = useState<Record<number, QuestionReview>>({})
  // the answered question kept on screen until Next question; null shows the next unanswered one
  const [showing, setShowing] = useState<number | null>(null)
  // the short answer whose key is showing, waiting to be marked right or wrong
  const [revealed, setRevealed] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // a ref, not the state: two clicks in one tick both read the pre-render value of `busy`
  const inFlight = useRef(false)
  // one-shot commands, as on the study page: the caret goes to the answer's band once it renders,
  // or to the new question's prompt (or the setup and results headings) once that renders
  const band = useRef<HTMLDivElement>(null)
  const wantBand = useRef(false)
  const landing = useRef<HTMLElement | null>(null)
  const wantLanding = useRef(false)
  const takeLanding = useCallback((el: HTMLElement | null) => { landing.current = el }, [])

  useEffect(() => {
    let current = true
    api.quiz(course.id)
      .then(loaded => { if (current) setQuestions(loaded) })
      .catch(e => { if (current) setError(String(e)) })
    return () => { current = false }
  }, [course.id])

  useLayoutEffect(() => {
    if (busy) return
    if (wantBand.current && band.current) {
      wantBand.current = false
      band.current.focus()
    } else if (wantLanding.current && landing.current) {
      wantLanding.current = false
      landing.current.focus()
    }
  })

  const byId = useMemo(() => new Map((questions ?? []).map(q => [q.id, q])), [questions])
  const quiz = run && questions ? asked(run, byId) : []
  const current = run ? quiz.find(q => !run.answers[q.id]) ?? null : null
  const onScreen = showing !== null ? byId.get(showing) ?? null : current

  function keep(next: QuizRun | null) {
    setRun(next)
    saveRun(course.id, next)
  }

  async function work(task: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (e) {
      setError(String(e))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function reviewOf(id: number): Promise<QuestionReview> {
    const cached = reviews[id]
    if (cached) return cached
    const review = await api.review(id)
    setReviews(r => ({ ...r, [id]: review }))
    return review
  }

  // the results page opens missed questions one at a time, and none of them should wait on another
  const loadReview = useCallback((id: number) => {
    api.review(id)
      .then(review => setReviews(r => ({ ...r, [id]: review })))
      .catch(e => setError(String(e)))
  }, [])

  function answered(q: QuizQuestion, answer: QuizAnswer): QuizRun | null {
    return run && { ...run, answers: { ...run.answers, [q.id]: answer } }
  }

  function start(order: number[]) {
    keep({ order, answers: {}, finished: false })
    setShowing(null)
    setRevealed(null)
    setText('')
    wantLanding.current = true
  }

  function answerMc(q: QuizQuestion, picked: number) {
    work(async () => {
      const review = await reviewOf(q.id)
      keep(answered(q, { picked, text: '', correct: review.correctIndex === picked }))
      setShowing(q.id)
      wantBand.current = true
    })
  }

  function reveal(q: QuizQuestion) {
    work(async () => {
      await reviewOf(q.id)
      setRevealed(q.id)
      wantBand.current = true
    })
  }

  function mark(q: QuizQuestion, correct: boolean) {
    const next = answered(q, { picked: null, text: text.trim(), correct })
    if (!next) return
    const done = asked(next, byId).every(x => next.answers[x.id])
    keep(done ? { ...next, finished: true } : next)
    setRevealed(null)
    setText('')
    wantLanding.current = true
  }

  function nextQuestion() {
    if (run && current === null) keep({ ...run, finished: true })
    setShowing(null)
    wantLanding.current = true
  }

  function end() {
    if (run) keep({ ...run, finished: true })
    setShowing(null)
    setRevealed(null)
    wantLanding.current = true
  }

  function newQuiz() {
    keep(null)
    wantLanding.current = true
  }

  const { answered: count } = run ? tally(run, quiz) : { answered: 0 }
  const running = run !== null && quiz.length > 0 && !run.finished && onScreen !== null
  const results = run !== null && quiz.length > 0 && !running

  return (
    <div className="quiz">
      {slot && run && quiz.length > 0 && createPortal(
        <div className="progress">
          <p className="figure"><b>{count}</b><span>of {quiz.length} answered</span></p>
          <div className="bar"><span style={{ width: `${Math.round((count / quiz.length) * 100)}%` }} /></div>
        </div>,
        slot,
      )}
      {error && <p className="alert" role="alert">{error}</p>}
      {questions === null && !error && <p className="empty">Loading the quiz…</p>}

      {questions !== null && !running && !results && (
        <Setup questions={questions} landing={takeLanding} onStart={start} />
      )}

      {running && run && onScreen && (
        <>
          <div className="study-nav" role="group" aria-label="Quiz">
            <span className="count" aria-live="polite">Question {quiz.indexOf(onScreen) + 1} of {quiz.length}</span>
            <button className="btn btn--ghost btn--micro" disabled={busy} onClick={end}>End quiz</button>
          </div>
          <article className="qcard-big">
            <QuestionHead question={onScreen} landing={takeLanding} />
            {onScreen.type === 'MC' ? (
              run.answers[onScreen.id] && reviews[onScreen.id] ? (
                <McReview question={onScreen} answer={run.answers[onScreen.id]} review={reviews[onScreen.id]}
                  band={band} last={current === null} onNext={nextQuestion} />
              ) : (
                <div className="opts">
                  {onScreen.options.map((option, i) => (
                    <button className="opt" key={i} disabled={busy} onClick={() => answerMc(onScreen, i)}>
                      <span className="letter" aria-hidden="true">{letter(i)}</span>{option}
                    </button>
                  ))}
                </div>
              )
            ) : revealed === onScreen.id && reviews[onScreen.id] ? (
              <>
                {text.trim() && <p className="your-answer">{text.trim()}</p>}
                <div ref={band} tabIndex={-1} className="verdict verdict--pending">
                  <p className="answer-key"><span>Model answer</span>{keyText(onScreen, reviews[onScreen.id])}</p>
                  {reviews[onScreen.id].rubric && (
                    <div className="answer-key">
                      <span>What a right answer needs</span>
                      <p className="quiz-rubric">{reviews[onScreen.id].rubric}</p>
                    </div>
                  )}
                  <Why question={onScreen} review={reviews[onScreen.id]} />
                  <p className="verdict-note">Check yours against the model answer, then mark it.</p>
                  <div className="actions">
                    <button className="btn btn--secondary" onClick={() => mark(onScreen, true)}>I got it right</button>
                    <button className="btn btn--secondary" onClick={() => mark(onScreen, false)}>I got it wrong</button>
                  </div>
                </div>
              </>
            ) : (
              <div className="short-answer">
                <textarea className="textarea" aria-label="Your answer" value={text}
                  disabled={busy} onChange={e => setText(e.target.value)} />
                <button className="btn" disabled={busy} onClick={() => reveal(onScreen)}>Show the answer</button>
              </div>
            )}
          </article>
        </>
      )}

      {results && run && (
        <Summary run={run} quiz={quiz} reviews={reviews} loadReview={loadReview} landing={takeLanding}
          onRetake={ids => start(shuffle(ids))} onNew={newQuiz} />
      )}
    </div>
  )
}

/* Picks what the quiz covers: the lectures, all of them to start with, and how many questions. */
function Setup({ questions, landing, onStart }: {
  questions: QuizQuestion[]
  landing: (el: HTMLElement | null) => void
  onStart: (order: number[]) => void
}) {
  const lectures = useMemo(() => lecturesOf(questions), [questions])
  const [picked, setPicked] = useState(() => new Set(lectures.map(l => l.id)))
  const [length, setLength] = useState<number | null>(null)
  const pool = lectures.filter(l => picked.has(l.id)).reduce((sum, l) => sum + l.questions, 0)
  const lengths = LENGTHS.filter(n => n < pool)
  const chosen = length !== null && lengths.includes(length) ? length : null

  function toggle(id: number) {
    setPicked(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="dash-card quiz-setup" aria-labelledby="quiz-title">
      <h2 id="quiz-title" className="dash-title" tabIndex={-1} ref={landing}>Quiz</h2>
      {questions.length === 0 ? (
        <>
          <p className="empty">This course has no questions yet. Upload a lecture in the bank and its questions join the quiz.</p>
          <Link className="btn btn--ghost" to="../bank">Open the bank</Link>
        </>
      ) : (
        <>
          <p className="lede">
            Every question from every topic, shuffled into one quiz. After each answer you see why it is
            right or wrong, straight from the slides. Nothing here changes your study schedule.
          </p>
          <fieldset className="quiz-fieldset">
            <legend className="field-label">Lectures</legend>
            <div className="chips">
              {lectures.map(lecture => (
                <label key={lecture.id} className="toggle">
                  <input type="checkbox" className="visually-hidden" checked={picked.has(lecture.id)}
                    onChange={() => toggle(lecture.id)} />
                  <span>{lecture.name}</span>
                  <span className="quiz-toggle-count">{lecture.questions}</span>
                </label>
              ))}
            </div>
            <div className="quiz-fieldset-actions">
              <button type="button" className="btn btn--ghost btn--micro"
                onClick={() => setPicked(new Set(lectures.map(l => l.id)))}>All lectures</button>
              <button type="button" className="btn btn--ghost btn--micro" onClick={() => setPicked(new Set())}>None</button>
            </div>
          </fieldset>
          {pool > LENGTHS[LENGTHS.length - 1] && (
            <fieldset className="quiz-fieldset">
              <legend className="field-label">Length</legend>
              <div className="chips">
                <label className="toggle">
                  <input type="radio" name="quiz-length" className="visually-hidden" checked={chosen === null}
                    onChange={() => setLength(null)} />
                  <span>All {pool}</span>
                </label>
                {lengths.map(n => (
                  <label key={n} className="toggle">
                    <input type="radio" name="quiz-length" className="visually-hidden" checked={chosen === n}
                      onChange={() => setLength(n)} />
                    <span>{n}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="actions">
            <button className="btn" disabled={pool === 0} onClick={() => onStart(buildQuiz(questions, picked, chosen))}>
              Start the quiz · {plural(chosen ?? pool, 'question')}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

/* An answered multiple-choice question: every option marked, each with why the slides make it
   right or wrong, then the verdict, the explanation and the way on. */
function McReview({ question, answer, review, band, last, onNext }: {
  question: QuizQuestion
  answer: QuizAnswer
  review: QuestionReview
  band: Ref<HTMLDivElement>
  last: boolean
  onNext: () => void
}) {
  const picked = answer.picked ?? -1
  return (
    <>
      <ol className="quiz-review" aria-label="Why each option is right or wrong">
        {question.options.map((option, i) => {
          const isKey = i === review.correctIndex
          const isPick = i === picked
          const tag = isKey && isPick ? 'Your answer, right' : isKey ? 'Right answer' : isPick ? 'Your answer' : null
          return (
            <li key={i} className={`quiz-opt${isKey ? ' is-key' : ''}${isPick && !isKey ? ' is-miss' : ''}`}>
              <p className="quiz-opt-line">
                <span className="letter" aria-hidden="true">{letter(i)}</span>
                <span className="quiz-opt-text">{option}</span>
                {tag && <span className="quiz-tag">{tag}</span>}
              </p>
              {review.optionExplanations[i] && <p className="quiz-opt-why">{review.optionExplanations[i]}</p>}
            </li>
          )
        })}
      </ol>
      <div ref={band} tabIndex={-1} className={`verdict ${answer.correct ? 'verdict--ok' : 'verdict--bad'}`}>
        <p className="verdict-line">
          <span className="bracket" aria-hidden="true" />
          {answer.correct ? 'Correct' : 'Incorrect'}
        </p>
        {picked >= 0 && <p className="verdict-note">You picked {letter(picked)}: {question.options[picked]}</p>}
        <Why question={question} review={review} />
        <div className="actions">
          <button className="btn" onClick={onNext}>{last ? 'See results' : 'Next question'}</button>
        </div>
      </div>
    </>
  )
}

/* why the answer is what it is, from the slides: the explanation, a diagram where one helps, and
   the lecture and slides to check it against */
function Why({ question, review }: { question: QuizQuestion; review: QuestionReview }) {
  const source = citation(question.lecture, question.sourcePages)
  return (
    <section className="why" aria-label="Why, from the slides">
      <p className="why-label">From the slides</p>
      {review.explanation
        ? review.explanation.split(/\n{2,}/).map((paragraph, i) => <p key={i} className="why-text">{paragraph}</p>)
        : <p className="why-text">No explanation has been written for this question yet.</p>}
      {review.diagram && <Diagram source={review.diagram} label={`Diagram: ${question.prompt}`} />}
      {source && <p className="why-source">{source}</p>}
    </section>
  )
}

/* How the quiz went: the score, each lecture weakest first, and the missed questions to look back
   on, with a way to retake just those. */
function Summary({ run, quiz, reviews, loadReview, landing, onRetake, onNew }: {
  run: QuizRun
  quiz: QuizQuestion[]
  reviews: Record<number, QuestionReview>
  loadReview: (id: number) => void
  landing: (el: HTMLElement | null) => void
  onRetake: (ids: number[]) => void
  onNew: () => void
}) {
  const { right, answered } = tally(run, quiz)
  const left = quiz.length - answered
  const lectures = byLecture(run, quiz)
  const missed = quiz.filter(q => run.answers[q.id] && !run.answers[q.id].correct)
  const pct = answered === 0 ? 0 : Math.round((right / answered) * 100)

  return (
    <section className="dash-card quiz-summary" aria-labelledby="quiz-summary-title">
      <h2 id="quiz-summary-title" className="dash-title" tabIndex={-1} ref={landing}>
        {left === 0 ? 'Quiz finished' : 'Quiz ended'}
      </h2>
      <div className="figures">
        <div className="figure-tile"><b>{right} / {answered}</b><span>right</span></div>
        <div className="figure-tile"><b>{pct}%</b><span>score</span></div>
      </div>
      {left > 0 && <p className="empty">Ended with {plural(left, 'question')} unanswered, which the score leaves out.</p>}
      {lectures.length > 0 && (
        <>
          <h3>By lecture, weakest first</h3>
          <ul className="quiz-scores">
            {lectures.map(score => (
              <li key={score.lecture}>
                <span className="quiz-score-name">{score.lecture}</span>
                <span className="count">{score.right} / {score.answered}</span>
                <div className="bar" aria-hidden="true">
                  <span style={{ width: `${Math.round((score.right / score.answered) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {missed.length > 0 && (
        <>
          <h3>Missed questions</h3>
          <ul className="quiz-missed">
            {missed.map(q => (
              <Missed key={q.id} question={q} answer={run.answers[q.id]} review={reviews[q.id]} loadReview={loadReview} />
            ))}
          </ul>
        </>
      )}
      <div className="actions">
        {missed.length > 0 && (
          <button className="btn" onClick={() => onRetake(missed.map(q => q.id))}>
            Retake the {plural(missed.length, 'missed question')}
          </button>
        )}
        <button className={missed.length > 0 ? 'btn btn--secondary' : 'btn'} onClick={onNew}>New quiz</button>
      </div>
    </section>
  )
}

/* a missed question, closed until opened; its explanation loads the first time it opens */
function Missed({ question, answer, review, loadReview }: {
  question: QuizQuestion
  answer: QuizAnswer
  review: QuestionReview | undefined
  loadReview: (id: number) => void
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (open && !review) loadReview(question.id)
  }, [open, review, question.id, loadReview])

  const yours = answer.picked !== null
    ? `You picked ${letter(answer.picked)}: ${question.options[answer.picked]}`
    : answer.text ? `You wrote: ${answer.text}` : 'You marked this one wrong.'

  return (
    <li>
      <details className="answer-review" onToggle={e => setOpen(e.currentTarget.open)}>
        <summary>{question.prompt}</summary>
        <div className="quiz-missed-body">
          <p className="verdict-note">{yours}</p>
          {review ? (
            <>
              <p className="answer-key"><span>{question.type === 'MC' ? 'Right answer' : 'Model answer'}</span>{keyText(question, review)}</p>
              <Why question={question} review={review} />
            </>
          ) : (
            open && <p className="empty">Loading why…</p>
          )}
        </div>
      </details>
    </li>
  )
}
