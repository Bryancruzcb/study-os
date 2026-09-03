import { useEffect, useState } from 'react'
import { api, type EvalReport } from '../api'

export default function EvalPage() {
  const [report, setReport] = useState<EvalReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.evalReport().then(setReport).catch(e => setError(String(e)))
  }, [])

  const pct = (x: number) => `${Math.round(x * 100)}%`

  return (
    <div>
      <h2>Evaluation</h2>
      {error && <p role="alert">{error}</p>}
      {!report && !error && <p>Loading…</p>}
      {report && (
        <div>
          <p>{report.labeled} labeled questions</p>
          <ul>
            <li>Answerable from source: {pct(report.pctAnswerable)}</li>
            <li>Correct answer: {pct(report.pctCorrectAnswer)}</li>
            <li>Unambiguous: {pct(report.pctUnambiguous)}</li>
          </ul>
          {/* the backend reports 0.0 agreement for "nothing graded" too, and 0% would read as total disagreement */}
          {report.gradedShortAnswers === 0
            ? <p>No graded short answers yet.</p>
            : <p>{report.gradedShortAnswers} graded short answers, {pct(report.graderAgreement)} grader agreement</p>}
        </div>
      )}
    </div>
  )
}
