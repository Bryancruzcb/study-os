import { useEffect, useState } from 'react'
import { api, type EvalReport } from '../api'
import { plural } from '../plural'

/* under this many graded short answers, the agreement figure wears the flag */
const REAL_SAMPLE = 30

export default function EvalPage() {
  const [report, setReport] = useState<EvalReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.evalReport().then(setReport).catch(e => setError(String(e)))
  }, [])

  const pct = (x: number) => `${Math.round(x * 100)}%`

  return (
    <div className="page">
      <header className="page-head">
        <h1>Evaluation</h1>
      </header>
      {error && <p className="alert" role="alert">{error}</p>}
      {!report && !error && <p className="empty">Loading…</p>}
      {report && (
        <div className="eval-panel">
          {/* the backend reports 0.0 rates for "nothing labeled" too, and 0% would read as
              "no question is answerable" rather than "no question has been judged yet" */}
          {report.labeled === 0
            ? <p className="empty">No labeled questions yet.</p>
            : <p className="lede">{plural(report.labeled, 'labeled question')}</p>}
          <ul className="figures">
            {report.labeled > 0 && (
              <>
                <li className="figure-tile"><b>{pct(report.pctAnswerable)}</b><span>Answerable from source</span></li>
                <li className="figure-tile"><b>{pct(report.pctCorrectAnswer)}</b><span>Correct answer</span></li>
                <li className="figure-tile"><b>{pct(report.pctUnambiguous)}</b><span>Unambiguous</span></li>
              </>
            )}
            {report.gradedShortAnswers > 0 && (
              <li className={`figure-tile${report.gradedShortAnswers < REAL_SAMPLE ? ' figure-tile--flag' : ''}`}>
                <b>{pct(report.graderAgreement)}<span className="figure-n">n={report.gradedShortAnswers}</span></b>
                <span>Grader agreement</span>
              </li>
            )}
          </ul>
          {/* the backend reports 0.0 agreement for "nothing graded" too, and 0% would read as total disagreement */}
          {report.gradedShortAnswers === 0
            ? <p className="empty">No graded short answers yet.</p>
            : <p className="eval-line">{plural(report.gradedShortAnswers, 'graded short answer')}, {pct(report.graderAgreement)} grader agreement</p>}
          {report.gradedShortAnswers > 0 && report.gradedShortAnswers < REAL_SAMPLE && (
            <p className="caveat">
              The grader agreement covers only {plural(report.gradedShortAnswers, 'graded short answer')}.
              The flag stays until there are {REAL_SAMPLE}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
