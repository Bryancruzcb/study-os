import { useEffect, useLayoutEffect, useRef, useState, type Ref } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { api, type ConceptStats, type Dashboard } from '../api'
import { plural } from '../plural'
import type { CourseContext } from '../shell/CourseLayout'
import { citation, slides } from '../source'

/* how many of the weakest concepts the page leads with */
const FOCUS = 5
/* lecture rows to a page: a course with twenty-eight lectures turns four pages rather than
   scrolling one long list */
const LECTURES_PER_PAGE = 8

/* a share of graded answers that were right, as a whole percent */
const percent = (correct: number, attempts: number) => Math.round((correct / attempts) * 100)

/* Where a concept stands: its last graded answer was right, it was wrong (a miss resets the
   streak to zero, so answers and no streak mean the last one missed), or it was never graded. */
type Standing = 'right' | 'weak' | 'new'
const standing = (c: ConceptStats): Standing => (c.neverAttempted ? 'new' : c.streak === 0 ? 'weak' : 'right')

/* Weakest first: the lowest share correct leads, a tie goes to the concept with more answers
   behind it, and concepts never attempted follow in the order the lectures produced them,
   since nothing yet says they are weak. */
function weakestFirst(concepts: ConceptStats[]): ConceptStats[] {
  const tried = concepts.filter(c => !c.neverAttempted)
    .sort((a, b) => percent(a.correct, a.attempts) - percent(b.correct, b.attempts) || b.attempts - a.attempts)
  return [...tried, ...concepts.filter(c => c.neverAttempted)]
}

interface Lecture {
  name: string
  concepts: ConceptStats[]
  counts: Record<Standing, number>
  correct: number
  attempts: number
}

/* the course's lectures in the order they were uploaded, each with its concepts and how they stand */
function byLecture(concepts: ConceptStats[]): Lecture[] {
  const lectures = new Map<string, Lecture>()
  for (const c of concepts) {
    const name = c.lecture ?? 'No lecture file'
    const lecture = lectures.get(name)
      ?? { name, concepts: [], counts: { right: 0, weak: 0, new: 0 }, correct: 0, attempts: 0 }
    lecture.concepts.push(c)
    lecture.counts[standing(c)] += 1
    lecture.correct += c.correct
    lecture.attempts += c.attempts
    lectures.set(name, lecture)
  }
  return [...lectures.values()]
}

export default function DashboardPage() {
  const { course } = useOutletContext<CourseContext>()
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.dashboard(course.id).then(setDash).catch(e => setError(String(e)))
  }, [course.id])

  const concepts = dash?.concepts ?? []
  const graded = concepts.reduce((n, c) => n + c.attempts, 0)
  const correct = concepts.reduce((n, c) => n + c.correct, 0)
  const toWorkOn = weakestFirst(concepts.filter(c => standing(c) === 'weak'))

  return (
    <div className="dashboard">
      <ul className="figures">
        <li className="figure-tile"><b>{course.dueToday}</b><span>due today</span></li>
        {dash && (
          <>
            {/* nothing graded is no score at all, not a score of zero */}
            {graded > 0 && <li className="figure-tile"><b>{percent(correct, graded)}%</b><span>correct</span></li>}
            <li className="figure-tile"><b>{toWorkOn.length}</b><span>to work on</span></li>
            <li className="figure-tile"><b>{concepts.filter(c => c.neverAttempted).length}</b><span>not started</span></li>
          </>
        )}
      </ul>
      {error && <p className="alert" role="alert">{error}</p>}
      {dash && concepts.length === 0 && (
        <div className="dash-card">
          <p className="empty">No concepts yet.</p>
        </div>
      )}
      {dash && concepts.length > 0 && (
        <>
          <section className="dash-card" aria-labelledby="focus-title">
            <h2 id="focus-title" className="dash-title">Work on these next</h2>
            {toWorkOn.length === 0 ? (
              <p className="empty">
                {graded > 0
                  ? 'Nothing to work on: your last answer was right on every concept you have tried.'
                  : 'Answer a few questions and the concepts to work on will show up here.'}
              </p>
            ) : (
              <ol className="focus-list">
                {toWorkOn.slice(0, FOCUS).map(c => <FocusItem key={c.conceptId} concept={c} />)}
              </ol>
            )}
            {toWorkOn.length > FOCUS && (
              <p className="dash-more">{plural(toWorkOn.length - FOCUS, 'more concept')} to work on, marked in the lectures below.</p>
            )}
          </section>
          {/* keyed, so another course starts back on the first page */}
          <Lectures key={course.id} lectures={byLecture(concepts)} />
        </>
      )}
    </div>
  )
}

/* one of the weakest concepts: where it comes from, and how its answers have gone */
function FocusItem({ concept: c }: { concept: ConceptStats }) {
  const source = citation(c.lecture, c.sourcePages)
  return (
    <li className="focus-item">
      <div>
        {/* the bank shows the concept's questions with their slides, to check the work against */}
        <Link className="dash-link" to={`../bank/${c.conceptId}`}>{c.name}</Link>
        {source && <span className="dash-source">{source}</span>}
      </div>
      <p className="focus-score"><b>{percent(c.correct, c.attempts)}%</b><span>{c.correct} of {c.attempts} right</span></p>
    </li>
  )
}

function Lectures({ lectures }: { lectures: Lecture[] }) {
  const [page, setPage] = useState(0)
  const pages = Math.ceil(lectures.length / LECTURES_PER_PAGE)
  const shown = lectures.slice(page * LECTURES_PER_PAGE, (page + 1) * LECTURES_PER_PAGE)
  // a page turn that disables its own button would drop the caret on the page, so the first
  // lecture on the page it opened takes it instead
  const landOnFirst = useRef(false)
  const first = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    if (!landOnFirst.current) return
    landOnFirst.current = false
    first.current?.focus()
  }, [page])

  function turn(to: number) {
    if (to === 0 || to === pages - 1) landOnFirst.current = true
    setPage(to)
  }

  return (
    <section className="dash-card" aria-labelledby="lectures-title">
      <div className="dash-head">
        <h2 id="lectures-title" className="dash-title">By lecture</h2>
        <ul className="legend">
          <li><span className="swatch swatch--right" aria-hidden="true" />Right last time</li>
          <li><span className="swatch swatch--weak" aria-hidden="true" />To work on</li>
          <li><span className="swatch swatch--new" aria-hidden="true" />Not started</li>
        </ul>
      </div>
      <ul className="lectures">
        {shown.map((lecture, i) => (
          <LectureRow key={lecture.name} lecture={lecture} summaryRef={i === 0 ? first : undefined} />
        ))}
      </ul>
      {pages > 1 && (
        <div className="pager" role="group" aria-label="Lecture pages">
          <button className="btn btn--secondary btn--micro" disabled={page === 0}
            onClick={() => turn(page - 1)}>Previous</button>
          <span className="count" aria-live="polite">Page {page + 1} of {pages}</span>
          <button className="btn btn--secondary btn--micro" disabled={page === pages - 1}
            onClick={() => turn(page + 1)}>Next</button>
        </div>
      )}
    </section>
  )
}

/* A lecture in one row: its name, a bar of how its concepts stand, and the same counts in
   words, which are what a screen reader hears. Opening it lists the concepts themselves. */
function LectureRow({ lecture, summaryRef }: { lecture: Lecture; summaryRef?: Ref<HTMLElement> }) {
  const { right, weak, new: fresh } = lecture.counts
  return (
    <li className="lecture">
      <details>
        <summary className="lecture-head" ref={summaryRef}>
          <span className="lecture-name">{lecture.name}</span>
          <span className="lecture-bar" aria-hidden="true">
            {right > 0 && <span className="lecture-bar-right" style={{ flexGrow: right }}
              title={`${plural(right, 'concept')} right last time`} />}
            {weak > 0 && <span className="lecture-bar-weak" style={{ flexGrow: weak }}
              title={`${plural(weak, 'concept')} to work on`} />}
            {fresh > 0 && <span className="lecture-bar-new" style={{ flexGrow: fresh }}
              title={`${plural(fresh, 'concept')} not started`} />}
          </span>
          <span className="lecture-counts">
            {lecture.attempts > 0 && <b>{percent(lecture.correct, lecture.attempts)}% correct</b>}
            <span>{right} right · {weak} to work on · {fresh} not started</span>
          </span>
        </summary>
        <div className="lecture-table">
          <table className="ledger">
            <thead><tr><th>Concept</th><th>Correct</th><th>Streak</th><th>Due</th></tr></thead>
            <tbody>
              {weakestFirst(lecture.concepts).map(c => <ConceptRow key={c.conceptId} concept={c} />)}
            </tbody>
          </table>
        </div>
      </details>
    </li>
  )
}

/* a concept inside its lecture: the lecture is already named above, so only its slides */
function ConceptRow({ concept: c }: { concept: ConceptStats }) {
  const where = standing(c)
  return (
    <tr className={where === 'new' ? 'is-new' : where === 'weak' ? 'is-weak' : undefined}>
      <td>
        <Link className="dash-link" to={`../bank/${c.conceptId}`}>{c.name}</Link>
        {where === 'new' && <span className="row-mark"> (new)</span>}
        {where === 'weak' && <span className="row-mark row-mark--flag"> needs work</span>}
        {c.sourcePages && <span className="dash-source">{slides(c.sourcePages)}</span>}
      </td>
      <td className="num">
        {c.neverAttempted ? '–' : <><b>{percent(c.correct, c.attempts)}%</b> <span className="ledger-count">{c.correct}/{c.attempts}</span></>}
      </td>
      <td className="num">{c.streak}</td>
      <td className="num">{c.dueDate}</td>
    </tr>
  )
}
