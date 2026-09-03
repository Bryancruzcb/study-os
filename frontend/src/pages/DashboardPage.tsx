import { useEffect, useState } from 'react'
import { api, type Course, type Dashboard } from '../api'

export default function DashboardPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [courseId, setCourseId] = useState<number | null>(null)
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.courses().then(cs => {
      setCourses(cs)
      if (cs.length > 0) setCourseId(cs[0].id)
    }).catch(e => setError(String(e)))
  }, [])

  useEffect(() => {
    if (courseId != null) api.dashboard(courseId).then(setDash).catch(e => setError(String(e)))
  }, [courseId])

  return (
    <div className="page">
      <header className="page-head">
        <h2 className="page-title">Dashboard</h2>
        <div className="toolbar">
          <select className="select" value={courseId ?? ''} onChange={e => setCourseId(Number(e.target.value))}>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </header>
      {error && <p className="alert" role="alert">{error}</p>}
      {dash && (
        <div className="stack">
          <p className="due-line">{dash.dueToday} due today</p>
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
