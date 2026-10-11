import type { Exam } from './api'
import { coverage, dueClause, headline, leadExam, outlook } from './plan'

const exam = (over: Partial<Exam>): Exam => ({
  id: 1, name: 'Midterm', date: '2026-09-26', lectureIds: [1, 2], status: 'upcoming',
  plan: { daysLeft: 14, reviewDays: 3, lastNewDay: '2026-09-22', topics: 22, topicsLeft: 18, newToday: 2, reviewsToday: 5 },
  ...over,
})

test('the nearest exam still ahead leads, and a past one never does', () => {
  const final = exam({ id: 2, name: 'Final', date: '2026-12-10' })
  const midterm = exam({ id: 3, date: '2026-10-20' })
  const old = exam({ id: 4, date: '2026-09-01', status: 'past', plan: null })
  expect(leadExam([final, old, midterm])).toBe(midterm)
  expect(leadExam([old])).toBeNull()
  expect(leadExam([])).toBeNull()
})

test('the headline answers what today holds', () => {
  expect(headline(exam({}), 7, false)).toBe('Today: 2 new topics and 5 reviews.')
  expect(headline(exam({ plan: { ...exam({}).plan!, newToday: 1, reviewsToday: 0 } }), 1, false)).toBe('Today: 1 new topic.')
  expect(headline(exam({ status: 'today', plan: null }), 4, false)).toBe('Midterm is today.')
  expect(headline(null, 4, false)).toBe('4 due today.')
  expect(headline(null, 0, false)).toBe('Nothing due today.')
  // a course with nothing in it says that first, whatever its exams say
  expect(headline(exam({}), 0, true)).toBe('No concepts yet.')
})

test('"that makes" is only said when the exam\'s count is the course\'s', () => {
  expect(dueClause(exam({}), 7)).toEqual({ kind: 'sum', due: 7 })
  expect(dueClause(exam({}), 9)).toEqual({ kind: 'course', due: 9 })
  expect(dueClause(null, 9)).toEqual({ kind: 'course', due: 9 })
  expect(dueClause(exam({}), 0)).toEqual({ kind: 'none' })
})

test('the outlook says when new topics stop, and the coverage how much of the course it takes', () => {
  expect(outlook(exam({}).plan!)).toBe('New topics run through Tue, Sep 22, then 3 days of review before the exam.')
  expect(outlook({ ...exam({}).plan!, reviewDays: 0 })).toBe('New topics run through Tue, Sep 22.')
  expect(outlook({ ...exam({}).plan!, topicsLeft: 0 })).toBe('Every topic is started. Reviewing until the exam.')
  expect(outlook({ ...exam({}).plan!, topics: 0 })).toBe('Its lectures have no topics with questions yet.')
  expect(coverage(exam({}), 2)).toBe('It covers all 2 lectures.')
  expect(coverage(exam({}), 3)).toBe('It covers 2 lectures. 4 of its 22 topics started.')
  expect(coverage(exam({ lectureIds: [1] }), 1)).toBe('It covers 1 lecture.')
})
