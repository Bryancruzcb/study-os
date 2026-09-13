import { markSignedOut } from './auth'

export interface Course { id: number; name: string; term: string }
export interface CourseOverview {
  id: number
  name: string
  term: string
  concepts: number
  questions: number
  dueToday: number
}
export interface Question {
  id: number
  type: 'MC' | 'SHORT_ANSWER'
  prompt: string
  optionsJson: string | null
  correctIndex: number | null
  sourcePages: string | null
  status: 'ACTIVE' | 'RETIRED'
  labelAnswerable: boolean | null
  labelCorrectAnswer: boolean | null
  labelUnambiguous: boolean | null
}
export interface ConceptWithQuestions {
  id: number
  name: string
  summary: string
  sourcePages: string | null
  // the lecture file the concept was drawn from
  lecture: string | null
  questions: Question[]
}
export interface Material {
  id: number
  filename: string
  status: 'PENDING' | 'INGESTED' | 'FAILED'
  errorMessage: string | null
}
export interface StudyQuestion { id: number; conceptId: number; topic: string | null; lecture: string | null; type: 'MC' | 'SHORT_ANSWER'; prompt: string; options: string[]; sourcePages: string | null }
export interface Attempt { id: number; verdict: 'CORRECT' | 'INCORRECT' | 'PENDING'; score: number | null; feedback: string | null }
export interface AnsweredAttempt extends Attempt { answerKey: string | null }
export interface ConceptStats { conceptId: number; name: string; lecture: string | null; sourcePages: string | null; streak: number; attempts: number; correct: number; dueDate: string; neverAttempted: boolean }
export interface Dashboard { dueToday: number; concepts: ConceptStats[] }
/* a labeled question that failed at least one check, with where it lives so the page can link to its card */
export interface ReviewItem { questionId: number; courseId: number; course: string; conceptId: number; concept: string; prompt: string; answerable: boolean; correctAnswer: boolean; unambiguous: boolean }
export interface EvalReport { labeled: number; pctAnswerable: number; pctCorrectAnswer: number; pctUnambiguous: number; gradedShortAnswers: number; graderAgreement: number; needsReview: ReviewItem[] }
/* a lecture the course has ingested, for picking what an exam covers */
export interface Lecture { id: number; filename: string; concepts: number }
/* where an exam's plan stands today, worked out again by the server every day */
export interface ExamPlan { daysLeft: number; reviewDays: number; lastNewDay: string; topics: number; topicsLeft: number; newToday: number; reviewsToday: number }
export interface Exam { id: number; name: string; date: string; lectureIds: number[]; status: 'upcoming' | 'today' | 'past'; plan: ExamPlan | null }
export interface ExamInput { name: string; date: string; lectureIds: number[] }

// A 200 that is not JSON means the request never reached the backend: the vite dev
// server answers an unproxied /api path with index.html. res.json() would report that
// as "Unexpected token '<'", which says nothing about the cause, so name it here.
async function readJson<T>(res: Response, url: string): Promise<T> {
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) {
    throw new Error(
      `${url} answered with ${type || 'no content type'}, not JSON. The backend on :8080 is ` +
      `either down or not proxied — a vite dev server started before the /api proxy was ` +
      `configured serves index.html here and needs a restart.`)
  }
  return res.json()
}

/* Every call goes through here. A write carries the CSRF token the server planted in a cookie, which
   a page on another site cannot read, and a 401 means the session is gone, so the page goes back to
   the sign-in form in shell/AuthGate. */
async function send(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const method = (init.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    const token = csrfToken()
    if (token) headers.set('X-XSRF-TOKEN', token)
  }
  const res = await fetch(url, { ...init, headers })
  if (res.status === 401) markSignedOut()
  return res
}

/* read fresh on every write, because signing in replaces the token */
function csrfToken(): string | null {
  const match = /(?:^|;\s*)XSRF-TOKEN=([^;]*)/.exec(document.cookie)
  return match ? decodeURIComponent(match[1]) : null
}

/* the sign-in endpoints turn a request down with {"error": "<a sentence for the form>"} */
async function refusal(res: Response): Promise<Error> {
  try {
    const body = await res.json()
    if (body && typeof body.error === 'string') return new Error(body.error)
  } catch {
    // no JSON body, so the generic sentence below
  }
  return new Error(`Something went wrong (${res.status}). Try again.`)
}

async function account(url: string, body: unknown): Promise<string> {
  const res = await send(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await refusal(res)
  return (await readJson<{ username: string }>(res, url)).username
}

async function get<T>(url: string): Promise<T> {
  const res = await send(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return readJson<T>(res, url)
}

async function post<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await send(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return readJson<T>(res, url)
}

async function put<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await send(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return readJson<T>(res, url)
}

/* a delete answers 204 with no body, so there is nothing to read */
async function remove(url: string): Promise<void> {
  const res = await send(url, { method: 'DELETE' })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
}

async function uploadFile<T = unknown>(url: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const res = await send(url, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return readJson<T>(res, url)
}

export const api = {
  auth: {
    config: () => get<{ inviteRequired: boolean }>('/api/auth/config'),
    /* who this session belongs to, or null when nobody is signed in */
    me: async (): Promise<string | null> => {
      const res = await send('/api/auth/me')
      if (res.status === 401) return null
      if (!res.ok) throw new Error(`${res.status} /api/auth/me`)
      return (await readJson<{ username: string }>(res, '/api/auth/me')).username
    },
    login: (username: string, password: string) => account('/api/auth/login', { username, password }),
    signup: (username: string, password: string, inviteCode: string) =>
      account('/api/auth/signup', { username, password, inviteCode }),
    logout: async (): Promise<void> => {
      await send('/api/auth/logout', { method: 'POST' })
    },
  },
  overview: () => get<CourseOverview[]>('/api/courses/overview'),
  createCourse: (name: string, term: string) => post<Course>('/api/courses', { name, term }),
  bank: (courseId: number) => get<ConceptWithQuestions[]>(`/api/courses/${courseId}/bank`),
  upload: (courseId: number, file: File) => uploadFile<Material>(`/api/courses/${courseId}/materials`, file),
  retire: (questionId: number) => post(`/api/questions/${questionId}/retire`, {}),
  restore: (questionId: number) => post(`/api/questions/${questionId}/restore`, {}),
  label: (questionId: number, body: { answerable: boolean; correctAnswer: boolean; unambiguous: boolean }) =>
    post(`/api/questions/${questionId}/label`, body),
  next: async (courseId: number): Promise<StudyQuestion | null> => {
    const res = await send(`/api/study/next?courseId=${courseId}`)
    if (res.status === 204) return null
    if (!res.ok) throw new Error(`${res.status} /api/study/next`)
    return readJson<StudyQuestion>(res, '/api/study/next')
  },
  answer: (body: { questionId: number; answerIndex?: number; answerText?: string }) =>
    post<AnsweredAttempt>('/api/study/answer', body),
  override: (attemptId: number) => post<Attempt>(`/api/study/attempts/${attemptId}/override`, {}),
  selfGrade: (attemptId: number, correct: boolean) => post<Attempt>(`/api/study/attempts/${attemptId}/self-grade`, { correct }),
  dashboard: (courseId: number) => get<Dashboard>(`/api/dashboard?courseId=${courseId}`),
  evalReport: () => get<EvalReport>('/api/eval/report'),
  lectures: (courseId: number) => get<Lecture[]>(`/api/courses/${courseId}/lectures`),
  exams: (courseId: number) => get<Exam[]>(`/api/courses/${courseId}/exams`),
  createExam: (courseId: number, body: ExamInput) => post<Exam>(`/api/courses/${courseId}/exams`, body),
  updateExam: (examId: number, body: ExamInput) => put<Exam>(`/api/exams/${examId}`, body),
  deleteExam: (examId: number) => remove(`/api/exams/${examId}`),
}
