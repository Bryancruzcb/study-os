import type { Course } from '../api'

/* The term most active courses share, which the line above the headline says once. On a
   tie the newest course's term wins, so the page names the term being studied now. */
export function commonTerm(courses: readonly Course[]): string | undefined {
  const counts = new Map<string, number>()
  for (const c of courses) counts.set(c.term, (counts.get(c.term) ?? 0) + 1)
  let best: string | undefined
  for (const c of courses) {
    if (best === undefined || counts.get(c.term)! >= counts.get(best)!) best = c.term
  }
  return best
}
