import { useCallback, useEffect, useState } from 'react'
import { api, type Attempt, type Course, type Question } from '../api'

export default function StudyPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [courseId, setCourseId] = useState<number | null>(null)
  const [question, setQuestion] = useState<Question | null>(null)
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [done, setDone] = useState(false)

  const load = useCallback(async (cid: number) => {
    setAttempt(null)
    const q = await api.next(cid)
    setQuestion(q)
    setDone(q === null)
  }, [])

  useEffect(() => {
    api.courses().then(cs => {
      setCourses(cs)
      if (cs.length > 0) {
        setCourseId(cs[0].id)
        load(cs[0].id)
      }
    })
  }, [load])

  async function answerMc(index: number) {
    if (!question) return
    setAttempt(await api.answer({ questionId: question.id, answerIndex: index }))
  }

  const options: string[] = question?.optionsJson ? JSON.parse(question.optionsJson) : []

  return (
    <div>
      <h2>Study</h2>
      <select value={courseId ?? ''} onChange={e => {
        const cid = Number(e.target.value)
        setCourseId(cid)
        load(cid)
      }}>
        {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {done && <p>Nothing due. Come back tomorrow.</p>}
      {question && (
        <div>
          <p>{question.prompt} <small>pp. {question.sourcePages}</small></p>
          {question.type === 'MC' && !attempt &&
            options.map((o, i) => <button key={i} onClick={() => answerMc(i)}>{o}</button>)}
          {attempt && (
            <div>
              <p>{attempt.verdict} {attempt.feedback && `— ${attempt.feedback}`}</p>
              <button onClick={() => courseId != null && load(courseId)}>Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
