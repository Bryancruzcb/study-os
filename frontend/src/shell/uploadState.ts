import { createContext, useCallback, useContext } from 'react'
import type { IngestPhase } from '../uploads'

/* The upload queue's shape and the hooks pages read it through. The queue itself, and the
   worker that empties it, live in UploadQueueProvider. */

/* One course's uploads, in the shape the course pages read from their context. */
export interface Ingest {
  /* true while any of this course's files is being sent, read, or waiting its turn */
  uploading: boolean
  /* idle | waiting (queued behind another file) | uploading (being made ready, or bytes on the
     wire) | processing (extraction in the background) */
  phase: IngestPhase
  /* the file being sent or read, while one is */
  current: string | null
  /* this course's files queued behind the current one */
  waiting: number
  /* the batch's failures, one line per file, until the next batch or the bank's next action clears them */
  error: string | null
  /* how many files have finished for this course; the bank reloads when it moves */
  finished: number
  /* queue files for this course; each becomes its own lecture, one after another, except that
     two or more photos and nothing else wait for the student to say one lecture or several */
  upload: (files: readonly File[]) => void
  clearError: () => void
}

/* how the student answered "one lecture, or N separate lectures?" */
export type PhotoAnswer = { kind: 'one'; name: string } | { kind: 'separate' } | { kind: 'cancel' }

/* one file, or one set of photos made into one lecture, on its way into one course */
export type Job =
  | { kind: 'file'; courseId: number; file: File }
  | { kind: 'photos'; courseId: number; name: string; photos: readonly File[] }

export interface Active {
  courseId: number
  name: string
  phase: 'uploading' | 'processing'
}

export interface Outcome {
  error: string | null
  finished: number
}

export interface Queue {
  active: Active | null
  waiting: readonly Job[]
  outcomes: Readonly<Record<number, Outcome>>
  /* each course's photos waiting on the one-lecture question */
  questions: Readonly<Record<number, readonly File[]>>
  upload: (courseId: number, files: readonly File[]) => void
  clearError: (courseId: number) => void
  answer: (courseId: number, answer: PhotoAnswer) => void
}

export const NOTHING_YET: Outcome = { error: null, finished: 0 }

export const QueueContext = createContext<Queue | null>(null)

function useQueue(): Queue {
  const queue = useContext(QueueContext)
  if (!queue) throw new Error('An upload needs the UploadQueueProvider above it; App puts one around every page.')
  return queue
}

/* where one course's uploads stand, worked out from the queue */
function standing(queue: Queue, courseId: number) {
  const running = queue.active?.courseId === courseId ? queue.active : null
  const waiting = queue.waiting.filter(job => job.courseId === courseId).length
  const outcome = queue.outcomes[courseId] ?? NOTHING_YET
  const phase: IngestPhase = running ? running.phase : waiting > 0 ? 'waiting' : 'idle'
  return { phase, current: running?.name ?? null, waiting, error: outcome.error, finished: outcome.finished }
}

/* one course's uploads, with upload and clearError bound to it and kept the same between
   renders, so a page can list them as effect dependencies */
export function useIngest(courseId: number): Ingest {
  const queue = useQueue()
  const { upload: send, clearError: clear } = queue
  const upload = useCallback((files: readonly File[]) => send(courseId, files), [send, courseId])
  const clearError = useCallback(() => clear(courseId), [clear, courseId])
  const now = standing(queue, courseId)
  return { ...now, uploading: now.phase !== 'idle', upload, clearError }
}

/* The home page's view: every course's standing, an upload into any course, and how many
   files have landed anywhere, which moves whenever a course's counts may have. */
export function useUploads() {
  const queue = useQueue()
  const landed = Object.values(queue.outcomes).reduce((n, o) => n + o.finished, 0)
  return {
    standing: (courseId: number) => standing(queue, courseId),
    upload: queue.upload,
    clearError: queue.clearError,
    landed,
  }
}

/* the photos waiting on one course's question, or null, and the way to answer it */
export function usePhotoQuestion(courseId: number) {
  const { questions, answer } = useQueue()
  const reply = useCallback((a: PhotoAnswer) => answer(courseId, a), [answer, courseId])
  return { photos: questions[courseId] ?? null, answer: reply }
}

/* every course with photos waiting on the question, for the home page */
export function usePhotoQuestions(): readonly number[] {
  const { questions } = useQueue()
  return Object.keys(questions).map(Number)
}
