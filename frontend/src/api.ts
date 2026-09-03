export interface Course { id: number; name: string; term: string }
export interface Question {
  id: number
  type: 'MC' | 'SHORT_ANSWER'
  prompt: string
  optionsJson: string | null
  correctIndex: number | null
  sourcePages: string | null
  status: 'ACTIVE' | 'RETIRED'
}
export interface ConceptWithQuestions {
  id: number
  name: string
  summary: string
  sourcePages: string | null
  questions: Question[]
}
export interface Material {
  id: number
  filename: string
  status: 'PENDING' | 'INGESTED' | 'FAILED'
  errorMessage: string | null
}
export interface Attempt { id: number; verdict: 'CORRECT' | 'INCORRECT' | 'PENDING'; score: number | null; feedback: string | null }

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

async function post<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

async function uploadFile<T = unknown>(url: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(url, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

export const api = {
  courses: () => get<Course[]>('/api/courses'),
  createCourse: (name: string, term: string) => post<Course>('/api/courses', { name, term }),
  bank: (courseId: number) => get<ConceptWithQuestions[]>(`/api/courses/${courseId}/bank`),
  upload: (courseId: number, file: File) => uploadFile<Material>(`/api/courses/${courseId}/materials`, file),
  retire: (questionId: number) => post(`/api/questions/${questionId}/retire`, {}),
  next: async (courseId: number): Promise<Question | null> => {
    const res = await fetch(`/api/study/next?courseId=${courseId}`)
    if (res.status === 204) return null
    if (!res.ok) throw new Error(`${res.status} /api/study/next`)
    return res.json()
  },
  answer: (body: { questionId: number; answerIndex?: number; answerText?: string }) =>
    post<Attempt>('/api/study/answer', body),
}
