import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { api, type ConceptStats, type Dashboard } from '../api'
import { dayLabel } from '../dates'
import Icon from '../icons'
import { lectureIcon, lectureTint, lectureTitle } from '../lectures'
import { plural } from '../plural'
import {
  byLecture, moreToWorkOn, NO_LECTURE, percent, pickUpHere, standing, weakestFirst, type LectureProgress,
} from '../progress'
import type { CourseContext } from '../shell/CourseLayout'
import { citation, slides } from '../source'
import Exams from './Exams'

/* how many of the weakest concepts the page leads with */
const FOCUS = 5

/* The course dashboard, as a study path: what today holds and the button that starts it,
   the concepts to work on next in a card beside it, then every lecture on one path in the
   order it was uploaded. */
export default function DashboardPage() {
  const { course, refresh } = useOutletContext<CourseContext>()
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  // bumped when an exam changes or a failed load is retried: the numbers below reload
  const [planned, setPlanned] = useState(0)

  useEffect(() => {
    api.dashboard(course.id).then(setDash).catch(e => setError(String(e)))
  }, [course.id, planned])

  const concepts = dash?.concepts ?? []
  const graded = concepts.reduce((n, c) => n + c.attempts, 0)
  const correct = concepts.reduce((n, c) => n + c.correct, 0)
  const toWorkOn = weakestFirst(concepts.filter(c => standing(c) === 'weak'))
  // null while loading: the head waits to say "No concepts yet" until it knows
  const empty = dash ? concepts.length === 0 : error ? false : null

  function retry() {
    setError(null)
    setPlanned(p => p + 1)
  }

  const start = empty
    ? <Link className="btn btn--go" to="../bank"><Icon name="book-open" />Upload a lecture PDF</Link>
    : <Link className="btn btn--go" to="../study"><Icon name="play" className="icon icon--solid" />Start studying</Link>

  return (
    <div className="dashboard">
      <div className={`dash-hero${empty ? ' dash-hero--solo' : ''}`}>
        {/* what today holds for the nearest exam leads: the rest of the page is paced to it */}
        <Exams courseId={course.id} onChange={() => { setPlanned(p => p + 1); void refresh() }}
          dueToday={course.dueToday} empty={empty} start={start}>
          {!empty && (
            <ul className="figs" aria-label="Course numbers">
              <li><b>{course.dueToday}</b><span>due today</span></li>
              {dash && (
                <>
                  {/* nothing graded is no score at all, not a score of zero */}
                  {graded > 0 && (
                    <li><b>{percent(correct, graded)}%</b><span>correct, {correct} of {plural(graded, 'answer')}</span></li>
                  )}
                  <li><b>{toWorkOn.length}</b><span>to work on</span></li>
                  <li><b>{concepts.filter(c => c.neverAttempted).length}</b><span>not started</span></li>
                </>
              )}
            </ul>
          )}
        </Exams>
        {dash && concepts.length > 0 && <FocusCard toWorkOn={toWorkOn} graded={graded} />}
        {!dash && !error && <FocusSkeleton />}
      </div>
      {error && (
        <div className="notice" role="alert">
          <Icon name="triangle-alert" size={24} />
          <div>
            <h2 className="notice-title">Could not load this course's progress.</h2>
            <p>{error}. Your answers are safe: this page only reads them.</p>
            <button className="btn btn--secondary btn--micro" type="button" onClick={retry}>
              <Icon name="refresh-cw" size={16} />Try again
            </button>
          </div>
        </div>
      )}
      {dash && concepts.length > 0 && <LecturePath courseName={course.name} concepts={concepts} />}
      {!dash && !error && <PathSkeleton />}
    </div>
  )
}

/* the friendly card: the weakest concepts, each a way to its questions in the bank */
function FocusCard({ toWorkOn, graded }: { toWorkOn: ConceptStats[]; graded: number }) {
  const more = moreToWorkOn(toWorkOn.slice(FOCUS))
  return (
    <section className="focus-panel" aria-labelledby="focus-title">
      <div className="focus-card">
        <h2 id="focus-title" className="focus-title">Work on these next</h2>
        {toWorkOn.length === 0 ? (
          <p className="empty">
            {graded > 0
              ? 'Nothing to work on: your last answer was right on every concept you have tried.'
              : 'Answer a few questions and the concepts to work on will show up here.'}
          </p>
        ) : (
          <>
            <p className="focus-sub">Your last answer on each was wrong. Weakest first.</p>
            <ol className="focus-list">
              {toWorkOn.slice(0, FOCUS).map((c, i) => <FocusItem key={c.conceptId} concept={c} n={i + 1} />)}
            </ol>
            {more && <p className="focus-more">{more}</p>}
          </>
        )}
      </div>
    </section>
  )
}

function FocusItem({ concept: c, n }: { concept: ConceptStats; n: number }) {
  const source = citation(c.lecture, c.sourcePages)
  return (
    <li className="focus-item">
      <span className="focus-n" aria-hidden="true">{n}</span>
      <span className="focus-what">
        {/* the bank shows the concept's questions with their slides, to check the work against */}
        <Link className="dash-link" to={`../bank/${c.conceptId}`}>{c.name}</Link>
        {source && <span className="dash-source">{source}</span>}
      </span>
      <span className="focus-score"><Icon name="refresh-cw" size={14} />{c.correct} of {c.attempts} right</span>
    </li>
  )
}

/* every lecture on one dotted path, with how its concepts stand and a way into them */
function LecturePath({ courseName, concepts }: { courseName: string; concepts: ConceptStats[] }) {
  const lectures = byLecture(concepts)
  const total = concepts.length
  const right = lectures.reduce((n, l) => n + l.counts.right, 0)
  const weak = lectures.reduce((n, l) => n + l.counts.weak, 0)
  const started = right + weak
  const here = pickUpHere(lectures)
  return (
    <section className="path-section" aria-labelledby="path-title">
      <div className="path-side">
        <div className="path-stick">
          <h2 id="path-title">Your path through {plural(lectures.length, 'lecture')}</h2>
          <p className="path-intro">{started} of {plural(total, 'topic')} started. Lectures are in the order you uploaded them.</p>
          <span className="path-meter" aria-hidden="true">
            <span className="fill-right" style={{ width: `${(right / total) * 100}%` }} />
            <span className="fill-weak" style={{ width: `${(weak / total) * 100}%` }} />
          </span>
          <ul className="path-legend">
            <li className="k-right"><Icon name="circle-check" />Right last time</li>
            <li className="k-weak"><Icon name="refresh-cw" />To work on: last answer was wrong</li>
            <li className="k-new"><Icon name="circle-dashed" />Not started</li>
          </ul>
        </div>
      </div>
      <ol className="path">
        {lectures.map(lecture => (
          <PathNode key={lecture.name} lecture={lecture} courseName={courseName} here={lecture.name === here} />
        ))}
      </ol>
    </section>
  )
}

/* A lecture on the path: its icon chip, its title, how its concepts stand in words and as a
   bar, and the concepts themselves behind a disclosure. The bar repeats the words, so it is
   hidden from screen readers. */
function PathNode({ lecture, courseName, here }: { lecture: LectureProgress; courseName: string; here: boolean }) {
  const { right, weak, new: fresh } = lecture.counts
  const title = lecture.name === NO_LECTURE ? NO_LECTURE : lectureTitle(lecture.name, courseName)
  const topics = lecture.concepts.length
  return (
    <li className={`path-node${here ? ' is-here' : ''}`}>
      <span className={`lecture-chip tint-${lectureTint(lecture.name)}`}>
        {here && <span className="path-bubble">Pick up here</span>}
        <Icon name={lectureIcon(title)} size={26} />
      </span>
      <div className="path-what">
        <h3 className="lecture-name">{title}</h3>
        <p className="lecture-desc">
          <span>{plural(topics, 'topic')}</span>
          {right + weak === 0 ? (
            <span className="k-new"><Icon name="circle-dashed" size={14} />not started</span>
          ) : (
            <>
              {lecture.attempts > 0 && <b>{percent(lecture.correct, lecture.attempts)}% correct</b>}
              <span className="k-right"><Icon name="circle-check" size={14} />{right} right</span>
              <span className="k-weak"><Icon name="refresh-cw" size={14} />{weak} to work on</span>
              <span className="k-new"><Icon name="circle-dashed" size={14} />{fresh} not started</span>
            </>
          )}
        </p>
      </div>
      <span className="node-bar" aria-hidden="true">
        {right > 0 && <span className="fill-right" style={{ flexGrow: right }} />}
        {weak > 0 && <span className="fill-weak" style={{ flexGrow: weak }} />}
        {fresh > 0 && <span className="fill-new" style={{ flexGrow: fresh }} />}
      </span>
      <details className="lecture-concepts">
        <summary><Icon name="chevron-right" size={16} />See its {plural(topics, 'concept')}</summary>
        <div className="lecture-table">
          <table className="ledger">
            <caption>{lecture.name}</caption>
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
        {where === 'new' && <span className="row-mark k-new"><Icon name="circle-dashed" size={12} />new</span>}
        {where === 'weak' && <span className="row-mark k-weak"><Icon name="refresh-cw" size={12} />needs work</span>}
        {c.sourcePages && <span className="dash-source">{slides(c.sourcePages)}</span>}
      </td>
      <td className="num">
        {c.neverAttempted ? '–' : <><b>{percent(c.correct, c.attempts)}%</b> <span className="ledger-count">{c.correct}/{c.attempts}</span></>}
      </td>
      <td className="num">{c.streak}</td>
      <td className="num">{dayLabel(c.dueDate)}</td>
    </tr>
  )
}

function FocusSkeleton() {
  return (
    <div className="focus-panel" aria-hidden="true">
      <div className="focus-card">
        <span className="skeleton focus-sk-title" />
        {Array.from({ length: 5 }, (_, i) => <span key={i} className="skeleton focus-sk-row" />)}
      </div>
    </div>
  )
}

function PathSkeleton() {
  return (
    <div className="path-section" aria-hidden="true">
      <div className="path-side">
        <span className="skeleton path-sk-title" />
        <span className="skeleton path-sk-line" />
      </div>
      <ol className="path">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="path-node">
            <span className="lecture-chip skeleton" />
            <div className="path-what">
              <span className="skeleton path-sk-name" />
              <span className="skeleton path-sk-desc" />
            </div>
            <span className="node-bar skeleton" />
          </li>
        ))}
      </ol>
    </div>
  )
}
