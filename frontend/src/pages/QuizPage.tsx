import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { api, type Exam, type QuestionReview, type QuizQuestion } from '../api'
import { dayLabel } from '../dates'
import Icon from '../icons'
import { lectureTitle } from '../lectures'
import { letter } from '../letter'
import { leadExam, when } from '../plan'
import { plural } from '../plural'
import { asked, buildQuiz, byLecture, clearLocalRun, shuffle, takeLocalRun, tally, topicRows, type QuizAnswer, type QuizRun, type TopicRow } from '../quiz'
import type { CourseContext } from '../shell/CourseLayout'
import Loading, { SkBlock, SkLine } from '../shell/Loading'
import { citation, slideHref, slides } from '../source'
import { McReview, Why } from './AnswerReview'

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
   run is saved on the account, so another browser or device picks the quiz up where it stopped.
   While it runs, a side panel keeps the nearest exam, the score so far and every topic in view. */
export default function QuizPage() {
  const { course } = useOutletContext<CourseContext>()
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [run, setRun] = useState<QuizRun | null>(null)
  // the side panel's exam line; a course with none, or a failed load, simply leaves it out
  const [exams, setExams] = useState<Exam[]>([])
  // the question just taken out of the bank, until Undo or the next move
  const [reported, setReported] = useState<QuizQuestion | null>(null)
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
    Promise.all([api.quiz(course.id), api.quizProgress(course.id)])
      .then(async ([loaded, progress]) => {
        if (!current) return
        let next = progress
        if (next) {
          clearLocalRun(course.id)
        } else {
          // one-time lift of a run left in this browser before progress lived on the account
          const local = takeLocalRun(course.id)
          if (local) {
            next = local
            try { await api.saveQuizProgress(course.id, local) } catch { /* still usable this visit */ }
          }
        }
        if (!current) return
        setQuestions(loaded)
        setRun(next)
      })
      .catch(e => { if (current) setError(String(e)) })
    api.exams(course.id)
      .then(loaded => { if (current) setExams(loaded) })
      .catch(() => { /* the exam line is a convenience: without it the quiz still runs */ })
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

  async function keep(next: QuizRun | null) {
    setRun(next)
    if (next) await api.saveQuizProgress(course.id, next)
    else await api.clearQuizProgress(course.id)
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
    work(async () => {
      await keep({ order, answers: {}, finished: false })
      setShowing(null)
      setRevealed(null)
      setText('')
      setReported(null)
      wantLanding.current = true
    })
  }

  function answerMc(q: QuizQuestion, picked: number) {
    work(async () => {
      const review = await reviewOf(q.id)
      await keep(answered(q, { picked, text: '', correct: review.correctIndex === picked }))
      setShowing(q.id)
      setReported(null)
      wantBand.current = true
    })
  }

  // A bad question (a wrong key, nothing in the slides, two right answers) comes out of the bank
  // the way Retire takes it out there, and out of this quiz and its score. Undo puts it back;
  // the Bank can too, later.
  function report(q: QuizQuestion) {
    work(async () => {
      await api.retire(q.id)
      setQuestions(all => all && all.filter(x => x.id !== q.id))
      setReported(q)
      setShowing(null)
      setRevealed(null)
      setText('')
      wantLanding.current = true
    })
  }

  function undoReport() {
    const q = reported
    if (!q) return
    work(async () => {
      await api.restore(q.id)
      setQuestions(all => all && (all.some(x => x.id === q.id) ? all : [...all, q]))
      setReported(null)
      wantLanding.current = true
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
    work(async () => {
      await keep(done ? { ...next, finished: true } : next)
      setRevealed(null)
      setText('')
      wantLanding.current = true
    })
  }

  function nextQuestion() {
    work(async () => {
      if (run && current === null) await keep({ ...run, finished: true })
      setShowing(null)
      setReported(null)
      wantLanding.current = true
    })
  }

  function end() {
    work(async () => {
      if (run) await keep({ ...run, finished: true })
      setShowing(null)
      setRevealed(null)
      setReported(null)
      wantLanding.current = true
    })
  }

  function newQuiz() {
    work(async () => {
      await keep(null)
      wantLanding.current = true
    })
  }

  const { right, answered: count } = run ? tally(run, quiz) : { right: 0, answered: 0 }
  const running = run !== null && quiz.length > 0 && !run.finished && onScreen !== null
  const results = run !== null && quiz.length > 0 && !running
  const mcAnswered = onScreen !== null && onScreen.type === 'MC' && run !== null
    && Boolean(run.answers[onScreen.id]) && Boolean(reviews[onScreen.id])
  const slide = onScreen ? slideHref(onScreen.lectureId, onScreen.sourcePages) : null

  // Keys for a quiz in progress: 1 to 9 pick an option, Enter goes on once the answer is marked,
  // and O opens the cited slide. Typing in the short-answer box, or with a modifier held, is left
  // alone. The window listener is attached once and always calls the latest handler.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    onKey.current = e => {
      if (!running || !onScreen || busy || e.altKey || e.ctrlKey || e.metaKey) return
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if ((e.key === 'o' || e.key === 'O') && slide) {
        e.preventDefault()
        window.open(slide, '_blank', 'noopener')
      } else if (onScreen.type === 'MC' && run && !run.answers[onScreen.id] && /^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1
        if (i < onScreen.options.length) answerMc(onScreen, i)
      } else if (e.key === 'Enter' && mcAnswered && !target?.closest('button, a')) {
        e.preventDefault()
        nextQuestion()
      }
    }
  })
  useEffect(() => {
    const listen = (e: KeyboardEvent) => onKey.current(e)
    window.addEventListener('keydown', listen)
    return () => window.removeEventListener('keydown', listen)
  }, [])

  return (
    <div className={running ? 'quiz quiz--desk' : 'quiz'}>
      {error && <p className="alert" role="alert">{error}</p>}
      {reported && (
        <p className="quiz-reported" role="status">
          <span>Took “{reported.prompt}” out of your bank, so it won’t come up again.</span>
          <button className="btn btn--ghost btn--micro" disabled={busy} onClick={undoReport}>Undo</button>
        </p>
      )}
      {questions === null && !error && (
        <Loading what="the quiz">
          <div className="sk-stack">
            <SkLine w="mid" tall />
            <SkLine w="long" />
            <SkBlock h="lg" />
          </div>
        </Loading>
      )}

      {questions !== null && !running && !results && (
        <Setup questions={questions} landing={takeLanding} onStart={start} />
      )}

      {running && run && onScreen && (
        <div className="quiz-desk">
          <Rail courseName={course.name} exam={leadExam(exams)} rows={topicRows(run, quiz, onScreen.id)}
            right={right} missed={count - right} left={quiz.length - count} canOpenSlide={slide !== null} />

          <div className="quiz-main">
            <div className="quiz-top">
              <span className="quiz-count" aria-live="polite">Question {quiz.indexOf(onScreen) + 1} of {quiz.length}</span>
              <div className="bar" role="progressbar" aria-label="Questions answered"
                aria-valuemin={0} aria-valuemax={quiz.length} aria-valuenow={count}>
                <span style={{ width: `${Math.round((count / quiz.length) * 100)}%` }} />
              </div>
              <button className="btn btn--ghost btn--micro" disabled={busy} onClick={end}>End quiz</button>
            </div>

            <article className="quiz-question">
              <p className="quiz-meta">
                {onScreen.topic && <span>{onScreen.topic}</span>}
                {citation(onScreen.lecture, onScreen.sourcePages) && <span>{citation(onScreen.lecture, onScreen.sourcePages)}</span>}
                <span>{onScreen.type === 'MC' ? 'Multiple choice' : 'Short answer'}</span>
              </p>
              <p className="prompt" tabIndex={-1} ref={takeLanding}>{onScreen.prompt}</p>
              {onScreen.type === 'MC' ? (
                mcAnswered ? (
                  <McReview question={onScreen} picked={run.answers[onScreen.id].picked} correct={run.answers[onScreen.id].correct}
                    review={reviews[onScreen.id]} band={band} />
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
                  <div ref={band} tabIndex={-1} className="quiz-key">
                    <p className="answer-key"><span>Model answer</span>{keyText(onScreen, reviews[onScreen.id])}</p>
                    {reviews[onScreen.id].rubric && (
                      <div className="answer-key">
                        <span>What a right answer needs</span>
                        <p className="quiz-rubric">{reviews[onScreen.id].rubric}</p>
                      </div>
                    )}
                    <Why question={onScreen} review={reviews[onScreen.id]} />
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

            <div className="quiz-actions">
              <button className="btn btn--secondary" disabled={busy} onClick={() => report(onScreen)}>
                <Icon name="flag" size={16} />Report question
              </button>
              {mcAnswered && (
                <button className="btn" disabled={busy} onClick={nextQuestion}>{current === null ? 'See results' : 'Next question'}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {results && run && (
        <Summary run={run} quiz={quiz} reviews={reviews} loadReview={loadReview} landing={takeLanding}
          onRetake={ids => start(shuffle(ids))} onNew={newQuiz} />
      )}
    </div>
  )
}

/* The quiz at a glance, beside the question: the nearest exam, the score so far, and every topic
   the quiz covers with its lecture, its slides and how it has gone. */
function Rail({ courseName, exam, rows, right, missed, left, canOpenSlide }: {
  courseName: string
  exam: Exam | null
  rows: TopicRow[]
  right: number
  missed: number
  left: number
  canOpenSlide: boolean
}) {
  const total = right + missed + left
  return (
    <aside className="quiz-rail" aria-label="This quiz">
      {exam && (
        <div className="quiz-exam">
          <span className="quiz-exam-icon" aria-hidden="true"><Icon name="calendar" /></span>
          <span className="quiz-exam-text">
            <b>{exam.name} {when(exam)}</b>
            <span>{dayLabel(exam.date)} · covers {plural(exam.lectureIds.length, 'lecture')}</span>
          </span>
        </div>
      )}
      <section className="quiz-score" aria-labelledby="quiz-score-title">
        <h2 id="quiz-score-title" className="quiz-rail-title">This quiz</h2>
        <p className="quiz-score-line">{right} right · {missed} missed · {left} to go</p>
        <div className="quiz-score-bar" aria-hidden="true">
          <span className="is-right" style={{ width: `${(right / total) * 100}%` }} />
          <span className="is-missed" style={{ width: `${(missed / total) * 100}%` }} />
        </div>
      </section>
      <ol className="quiz-topics" aria-label="Topics in this quiz">
        {rows.map(row => {
          const state = row.answered === 0 ? 'todo' : row.right < row.answered ? 'missed' : 'right'
          const where = [row.lecture ? lectureTitle(row.lecture, courseName) : null, row.pages ? slides(row.pages) : null]
            .filter(Boolean).join(' · ')
          return (
            <li key={row.conceptId} className={`quiz-topic is-${state}${row.current ? ' is-current' : ''}`}
              aria-current={row.current ? 'step' : undefined}>
              {state === 'todo'
                ? <span className="quiz-topic-todo" role="img" aria-label="Not asked yet" />
                : <Icon name={state === 'right' ? 'check' : 'x'} size={16} role="img"
                    aria-hidden={undefined} aria-label={state === 'right' ? 'Right so far' : 'Missed'} />}
              <span className="quiz-topic-text">
                <span className="quiz-topic-name">{row.topic}</span>
                {where && <span className="quiz-topic-where">{where}{row.current ? ' · on now' : ''}</span>}
              </span>
              <span className="quiz-topic-count">{row.answered} of {row.asked}</span>
            </li>
          )
        })}
      </ol>
      {canOpenSlide && <p className="quiz-hint">Press <kbd>O</kbd> to open the slide</p>}
    </aside>
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
          <p className="lede">Nothing here changes your study schedule.</p>
          <fieldset className="quiz-fieldset">
            <legend className="field-label">Lectures</legend>
            {/* the exam form's checkbox rows, so picking lectures looks the same wherever it happens */}
            <div className="quiz-lectures">
              {lectures.map(lecture => (
                <label key={lecture.id} className="quiz-lecture">
                  <input type="checkbox" checked={picked.has(lecture.id)} onChange={() => toggle(lecture.id)} />
                  <span className="quiz-lecture-name">{lecture.name}</span>
                  <span className="count">{plural(lecture.questions, 'question')}</span>
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
          <p className="quiz-available" aria-live="polite">
            {plural(pool, 'question')} available for this selection.
          </p>
          <div className="actions">
            <button className="btn" disabled={pool === 0} onClick={() => onStart(buildQuiz(questions, picked, chosen))}>
              Start the quiz · {plural(chosen ?? pool, 'question')}
            </button>
          </div>
          {pool > 0 && (
            <p className="quiz-more">
              <Link className="quiz-more-link" to={`../bank?concepts=${conceptIdsFor(questions, picked)}`}>
                Need more? Generate in Bank
              </Link>
            </p>
          )}
        </>
      )}
    </section>
  )
}

/* concept ids covered by the lectures currently checked on the setup */
function conceptIdsFor(questions: readonly QuizQuestion[], picked: Set<number>): string {
  const ids = new Set<number>()
  for (const q of questions) {
    if (picked.has(q.lectureId)) ids.add(q.conceptId)
  }
  return [...ids].sort((a, b) => a - b).join(',')
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
