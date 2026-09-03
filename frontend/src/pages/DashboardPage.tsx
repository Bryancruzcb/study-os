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
    <div>
      <h2>Dashboard</h2>
      {error && <p role="alert">{error}</p>}
      <select value={courseId ?? ''} onChange={e => setCourseId(Number(e.target.value))}>
        {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {dash && (
        <div>
          <p>{dash.dueToday} due today</p>
          <table>
            <thead><tr><th>Concept</th><th>Streak</th><th>Correct</th><th>Due</th></tr></thead>
            <tbody>
              {dash.concepts.map(c => (
                <tr key={c.conceptId} style={{ fontWeight: c.neverAttempted ? 'bold' : 'normal' }}>
                  <td>{c.name}{c.neverAttempted && ' (new)'}</td>
                  <td>{c.streak}</td>
                  <td>{c.correct}/{c.attempts}</td>
                  <td>{c.dueDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
