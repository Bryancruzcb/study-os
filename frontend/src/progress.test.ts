import type { ConceptStats } from './api'
import { byLecture, moreToWorkOn, pickUpHere, standing, weakestFirst } from './progress'

const stats = (over: Partial<ConceptStats>): ConceptStats => ({
  conceptId: 1, name: 'Concept', lecture: 'A.pdf', sourcePages: '3', streak: 0,
  attempts: 0, correct: 0, dueDate: '2026-09-05', neverAttempted: true, ...over,
})

test('a concept is right, to work on, or not started, by its last graded answer', () => {
  expect(standing(stats({ attempts: 2, correct: 1, streak: 1, neverAttempted: false }))).toBe('right')
  expect(standing(stats({ attempts: 2, correct: 1, streak: 0, neverAttempted: false }))).toBe('weak')
  expect(standing(stats({}))).toBe('new')
})

test('weakest first: lowest share right, then more answers, then the untried in their own order', () => {
  const a = stats({ conceptId: 1, attempts: 2, correct: 1, neverAttempted: false })
  const b = stats({ conceptId: 2, attempts: 1, correct: 0, neverAttempted: false })
  const c = stats({ conceptId: 3, attempts: 3, correct: 0, neverAttempted: false })
  const d = stats({ conceptId: 4 })
  expect(weakestFirst([a, d, b, c]).map(x => x.conceptId)).toEqual([3, 2, 1, 4])
})

test('lectures keep the order their first concept came in, and add up their concepts', () => {
  const lectures = byLecture([
    stats({ conceptId: 1, lecture: 'B.pdf', attempts: 2, correct: 2, streak: 2, neverAttempted: false }),
    stats({ conceptId: 2, lecture: 'A.pdf' }),
    stats({ conceptId: 3, lecture: 'B.pdf', attempts: 1, correct: 0, neverAttempted: false }),
    stats({ conceptId: 4, lecture: null }),
  ])
  expect(lectures.map(l => l.name)).toEqual(['B.pdf', 'A.pdf', 'No lecture file'])
  expect(lectures[0].counts).toEqual({ right: 1, weak: 1, new: 0 })
  expect([lectures[0].correct, lectures[0].attempts]).toEqual([2, 3])
})

test('the work picks up at the first lecture to work on, else the first not started', () => {
  const tried = stats({ lecture: 'A.pdf', attempts: 1, correct: 1, streak: 1, neverAttempted: false })
  const missed = stats({ lecture: 'C.pdf', attempts: 1, correct: 0, neverAttempted: false })
  const fresh = stats({ lecture: 'B.pdf' })
  expect(pickUpHere(byLecture([tried, fresh, missed]))).toBe('C.pdf')
  expect(pickUpHere(byLecture([tried, fresh]))).toBe('B.pdf')
  expect(pickUpHere(byLecture([tried]))).toBeNull()
})

test('the concepts past the first five are named when there are a few, and counted when there are more', () => {
  const weak = (name: string) => stats({ name, attempts: 2, correct: 1, neverAttempted: false })
  expect(moreToWorkOn([])).toBeNull()
  expect(moreToWorkOn([weak('Paging')])).toBe('1 more to work on: Paging (1 of 2 right).')
  expect(moreToWorkOn([weak('Paging'), weak('TLB'), weak('Swap')]))
    .toBe('3 more to work on: Paging (1 of 2 right), TLB (1 of 2 right) and Swap (1 of 2 right).')
  expect(moreToWorkOn([weak('A'), weak('B'), weak('C'), weak('D')])).toBe('4 more concepts to work on, marked on the path below.')
})
