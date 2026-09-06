import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api, type Dashboard } from '../api'
import type { CourseContext } from '../shell/CourseLayout'

export default function DashboardPage() {
  const { course } = useOutletContext<CourseContext>()
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.dashboard(course.id).then(setDash).catch(e => setError(String(e)))
  }, [course.id])

  return (
    <div className="dashboard">
      <ul className="figures">
        <li className="figure-tile"><b>{course.dueToday}</b><span>due today</span></li>
        <li className="figure-tile"><b>{course.concepts}</b><span>concepts</span></li>
        <li className="figure-tile"><b>{course.questions}</b><span>questions</span></li>
      </ul>
      {error && <p className="alert" role="alert">{error}</p>}
      {dash && dash.concepts.length === 0 && (
        <div className="ledger-card">
          <p className="empty">No concepts yet.</p>
        </div>
      )}
      {dash && dash.concepts.length > 0 && (
        <div className="ledger-card">
          <table className="ledger">
            <thead><tr><th>Concept</th><th>Streak</th><th>Correct</th><th>Due</th></tr></thead>
            <tbody>
              {dash.concepts.map(c => (
                <tr key={c.conceptId} className={c.neverAttempted ? 'is-new' : undefined}>
                  <td>{c.name}{c.neverAttempted && <span className="row-mark"> (new)</span>}</td>
                  <td className="num">{c.streak}</td>
                  <td className="num">{c.correct}/{c.attempts}</td>
                  <td className="num">{c.dueDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
