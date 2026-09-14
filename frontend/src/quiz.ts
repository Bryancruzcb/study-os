import type { QuizQuestion } from './api'

/* One answer as the quiz took it: the option picked, or the short answer as typed, and
   whether it was right. A short answer is marked right or wrong by the student, after
   reading the model answer and why. */
export interface QuizAnswer {
  picked: number | null
  text: string
  correct: boolean
}

/* A quiz as the page keeps it between visits: which questions, in the order it asks them,
   and what has been answered. The questions themselves are fetched fresh on every visit,
   so one retired since the quiz began drops out of it. */
export interface QuizRun {
  order: number[]
  answers: Record<number, QuizAnswer>
  finished: boolean
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/* The question ids a new quiz asks, in asking order. Everything in the chosen lectures,
   shuffled so the topics mix. A shorter quiz deals from every topic in turn, so ten
   questions cover ten topics before any topic gets a second question. */
export function buildQuiz(
  questions: readonly QuizQuestion[],
  lectureIds: ReadonlySet<number>,
  length: number | null,
  random: () => number = Math.random,
): number[] {
  const pool = questions.filter(q => lectureIds.has(q.lectureId))
  if (length === null || length >= pool.length) return shuffle(pool, random).map(q => q.id)

  const byTopic = new Map<number, QuizQuestion[]>()
  for (const q of shuffle(pool, random)) byTopic.set(q.conceptId, [...(byTopic.get(q.conceptId) ?? []), q])
  const topics = shuffle([...byTopic.values()], random)
  const picked: number[] = []
  for (let round = 0; picked.length < length; round++) {
    for (const topic of topics) {
      if (picked.length === length) break
      if (round < topic.length) picked.push(topic[round].id)
    }
  }
  return shuffle(picked, random)
}

/* the questions still on the run, in asking order: ones retired since it began drop out */
export function asked(run: QuizRun, questions: ReadonlyMap<number, QuizQuestion>): QuizQuestion[] {
  return run.order.flatMap(id => questions.get(id) ?? [])
}

export interface Tally {
  right: number
  answered: number
}

export function tally(run: QuizRun, questions: readonly QuizQuestion[]): Tally {
  const answers = questions.flatMap(q => run.answers[q.id] ?? [])
  return { right: answers.filter(a => a.correct).length, answered: answers.length }
}

export interface LectureScore extends Tally {
  lecture: string
}

/* how each lecture went, weakest first, so the end of a quiz says what to study next */
export function byLecture(run: QuizRun, questions: readonly QuizQuestion[]): LectureScore[] {
  const scores = new Map<string, LectureScore>()
  for (const q of questions) {
    const answer = run.answers[q.id]
    if (!answer) continue
    const lecture = q.lecture ?? 'Unknown lecture'
    const score = scores.get(lecture) ?? { lecture, right: 0, answered: 0 }
    score.answered++
    if (answer.correct) score.right++
    scores.set(lecture, score)
  }
  return [...scores.values()].sort((a, b) =>
    a.right / a.answered - b.right / b.answered || b.answered - a.answered || a.lecture.localeCompare(b.lecture))
}

const key = (courseId: number) => `studyos.quiz.${courseId}`

function isRun(value: unknown): value is QuizRun {
  if (typeof value !== 'object' || value === null) return false
  const run = value as Partial<QuizRun>
  return Array.isArray(run.order) && run.order.every(Number.isInteger)
    && typeof run.answers === 'object' && run.answers !== null && typeof run.finished === 'boolean'
}

/* Storage can throw (a private window, blocked site data) or hold something else under the
   key; either way there is no quiz to pick up, and the page starts a new one. */
export function loadRun(courseId: number): QuizRun | null {
  try {
    const raw = localStorage.getItem(key(courseId))
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return isRun(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveRun(courseId: number, run: QuizRun | null) {
  try {
    if (run) localStorage.setItem(key(courseId), JSON.stringify(run))
    else localStorage.removeItem(key(courseId))
  } catch {
    // the quiz still works for this visit; it just cannot be picked up after a reload
  }
}
