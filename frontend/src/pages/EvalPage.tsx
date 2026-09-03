import { useEffect, useState } from 'react'
import { api, type EvalReport } from '../api'

export default function EvalPage() {
  const [report, setReport] = useState<EvalReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.evalReport().then(setReport).catch(e => setError(String(e)))
  }, [])

  const pct = (x: number) => `${Math.round(x * 100)}%`
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

  return (
    <div className="page">
      <header className="page-head">
        <h2 className="page-title">Evaluation</h2>
      </header>
      {error && <p className="alert" role="alert">{error}</p>}
      {!report && !error && <p className="empty">Loading…</p>}
      {report && (
        <div className="eval">
          {/* the backend reports 0.0 rates for "nothing labeled" too, and 0% would read as
              "no question is answerable" rather than "no question has been judged yet" */}
          {report.labeled === 0
            ? <p className="empty">No labeled questions yet.</p>
            : (
              <>
                <p className="eval-line">{count(report.labeled, 'labeled question')}</p>
                <ul className="figures">
                  <li className="figure">
                    <span className="figure-label">Answerable from source: </span>
                    <span className="figure-value">{pct(report.pctAnswerable)}</span>
                  </li>
                  <li className="figure">
                    <span className="figure-label">Correct answer: </span>
                    <span className="figure-value">{pct(report.pctCorrectAnswer)}</span>
                  </li>
                  <li className="figure">
                    <span className="figure-label">Unambiguous: </span>
                    <span className="figure-value">{pct(report.pctUnambiguous)}</span>
                  </li>
                </ul>
              </>
            )}
          {/* the backend reports 0.0 agreement for "nothing graded" too, and 0% would read as total disagreement */}
          {report.gradedShortAnswers === 0
            ? <p className="empty">No graded short answers yet.</p>
            : <p className="eval-line">{count(report.gradedShortAnswers, 'graded short answer')}, {pct(report.graderAgreement)} grader agreement</p>}
        </div>
      )}
    </div>
  )
}
