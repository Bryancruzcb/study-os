import type { ConceptStats } from './api'
import { plural } from './plural'

/* How a course's concepts stand, for the dashboard. Calculations over the dashboard's
   concept list: the same list always gives the same answer. */

/* a share of graded answers that were right, as a whole percent */
export const percent = (correct: number, attempts: number) => Math.round((correct / attempts) * 100)

/* Where a concept stands: its last graded answer was right, it was wrong (a miss resets the
   streak to zero, so answers and no streak mean the last one missed), or it was never graded. */
export type Standing = 'right' | 'weak' | 'new'
export const standing = (c: ConceptStats): Standing => (c.neverAttempted ? 'new' : c.streak === 0 ? 'weak' : 'right')

/* Weakest first: the lowest share correct leads, a tie goes to the concept with more answers
   behind it, and concepts never attempted follow in the order the lectures produced them,
   since nothing yet says they are weak. */
export function weakestFirst(concepts: readonly ConceptStats[]): ConceptStats[] {
  const tried = concepts.filter(c => !c.neverAttempted)
    .sort((a, b) => percent(a.correct, a.attempts) - percent(b.correct, b.attempts) || b.attempts - a.attempts)
  return [...tried, ...concepts.filter(c => c.neverAttempted)]
}

export interface LectureProgress {
  /* the lecture's filename, or 'No lecture file' for concepts that have none */
  name: string
  concepts: ConceptStats[]
  counts: Record<Standing, number>
  correct: number
  attempts: number
}

export const NO_LECTURE = 'No lecture file'

/* the course's lectures in the order they were uploaded (the server lists concepts by id,
   so a lecture's first concept places it), each with its concepts and how they stand */
export function byLecture(concepts: readonly ConceptStats[]): LectureProgress[] {
  const lectures = new Map<string, LectureProgress>()
  for (const c of concepts) {
    const name = c.lecture ?? NO_LECTURE
    const before = lectures.get(name)
      ?? { name, concepts: [], counts: { right: 0, weak: 0, new: 0 }, correct: 0, attempts: 0 }
    const where = standing(c)
    lectures.set(name, {
      name,
      concepts: [...before.concepts, c],
      counts: { ...before.counts, [where]: before.counts[where] + 1 },
      correct: before.correct + c.correct,
      attempts: before.attempts + c.attempts,
    })
  }
  return [...lectures.values()]
}

/* Where the path's "Pick up here" goes: the first lecture with a concept to work on, or
   failing that the first with one not started. A course with neither has nowhere to point. */
export function pickUpHere(lectures: readonly LectureProgress[]): string | null {
  return (lectures.find(l => l.counts.weak > 0) ?? lectures.find(l => l.counts.new > 0))?.name ?? null
}

/* The concepts to work on past the ones the page lists, in one sentence. A few are named
   with how they have gone; more than that are counted and left to the path. */
export const NAMED_REST = 3

export function moreToWorkOn(rest: readonly ConceptStats[]): string | null {
  if (rest.length === 0) return null
  if (rest.length > NAMED_REST) return `${plural(rest.length, 'more concept')} to work on, marked on the path below.`
  const named = rest.map(c => `${c.name} (${c.correct} of ${c.attempts} right)`)
  const list = named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`
  return `${rest.length} more to work on: ${list}.`
}
