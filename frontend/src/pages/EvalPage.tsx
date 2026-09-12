import { useEffect, useState } from 'react'
import { api, type EvalReport } from '../api'
import { plural } from '../plural'

const REAL_SAMPLE = 30

export default function EvalPage() {
  const [report, setReport] = useState<EvalReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.evalReport().then(setReport).catch(e => setError(String(e)))
  }, [])

  const pct = (x: number) => `${Math.round(x * 100)}%`
  const passed = (rate: number, total: number) => Math.round(rate * total)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Evaluation</p>
          <h1>Question quality</h1>
          <p className="lede">Use this page to check the question bank and automatic grading. It does not measure your course grade.</p>
        </div>
      </header>
      {error && <p className="alert" role="alert">{error}</p>}
      {!report && !error && <p className="empty">Loading…</p>}
      {report && (
        <div className="eval-panel">
          <section className="eval-section" aria-labelledby="question-checks-title">
            <div className="eval-section-head">
              <p className="eyebrow">Question checks</p>
              <h2 id="question-checks-title">Are the questions ready to study?</h2>
              <p>Each check comes from a manually labelled sample of bank questions.</p>
            </div>
            {report.labeled === 0 ? (
              <p className="empty">No question-quality labels yet. Label a few bank questions to start checking them here.</p>
            ) : (
              <ul className="quality-list">
                <QualityCheck title="Answerable from the source" detail="Can the cited source pages support the answer?"
                  rate={report.pctAnswerable} total={report.labeled} pct={pct} passed={passed} />
                <QualityCheck title="Answer key is correct" detail="Does the saved answer key match the source?"
                  rate={report.pctCorrectAnswer} total={report.labeled} pct={pct} passed={passed} />
                <QualityCheck title="One clear best answer" detail="Is the wording specific enough to avoid multiple reasonable answers?"
                  rate={report.pctUnambiguous} total={report.labeled} pct={pct} passed={passed} />
              </ul>
            )}
          </section>
          <section className="eval-section" aria-labelledby="grader-title">
            <div className="eval-section-head">
              <p className="eyebrow">Short-answer grading</p>
              <h2 id="grader-title">Is automatic grading matching your corrections?</h2>
              <p>This is separate from question quality: it checks the automatic short-answer verdict after you have a chance to reverse it.</p>
            </div>
            {report.gradedShortAnswers === 0 ? (
              <p className="empty">No automatically graded short answers yet. Complete short-answer prompts to start checking the grader.</p>
            ) : (
              <div className={`calibration${report.gradedShortAnswers < REAL_SAMPLE ? ' calibration--small' : ''}`}>
                <p className="calibration-score"><b>{pct(report.graderAgreement)} match</b><span>across {plural(report.gradedShortAnswers, 'automatically graded short answer')}</span></p>
                <p>The match rate changes when you reverse an automatic grade. It becomes more reliable after {REAL_SAMPLE} graded short answers.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

interface QualityCheckProps {
  title: string
  detail: string
  rate: number
  total: number
  pct: (rate: number) => string
  passed: (rate: number, total: number) => number
}

function QualityCheck({ title, detail, rate, total, pct, passed }: QualityCheckProps) {
  const ready = passed(rate, total)
  const needsReview = total - ready
  return (
    <li className="quality-check">
      <div>
        <h3>{title}</h3>
        <p>{detail}</p>
      </div>
      <p className="quality-score"><b>{ready} of {total}</b><span>{pct(rate)} pass · {plural(needsReview, 'question')} need review</span></p>
    </li>
  )
}
