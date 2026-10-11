import type { Exam, ExamPlan } from './api'
import { dayLabel } from './dates'
import { plural } from './plural'

/* What the dashboard leads with, worked out from the course's exams. Calculations only:
   the page hands in what it loaded and draws what comes back. */

/* when the exam is, counted from today */
export function when(exam: Exam): string {
  if (exam.status === 'today') return 'today'
  if (exam.status === 'past' || !exam.plan) return 'passed'
  return exam.plan.daysLeft === 1 ? 'tomorrow' : `in ${exam.plan.daysLeft} days`
}

/* what today holds for the exam: the topics to start and the reviews to do */
export function todayLine(plan: ExamPlan): string {
  const parts = [
    plan.newToday > 0 ? plural(plan.newToday, 'new topic') : null,
    plan.reviewsToday > 0 ? plural(plan.reviewsToday, 'review') : null,
  ].filter((part): part is string => part !== null)
  return parts.length > 0 ? `Today: ${parts.join(' and ')}` : 'Nothing due for this exam today'
}

/* where the plan stands: when starting topics gives way to review */
export function outlook(plan: ExamPlan): string {
  if (plan.topics === 0) return 'Its lectures have no topics with questions yet.'
  if (plan.topicsLeft === 0) return 'Every topic is started. Reviewing until the exam.'
  const review = plan.reviewDays > 0 ? `, then ${plural(plan.reviewDays, 'day')} of review before the exam` : ''
  return `New topics run through ${dayLabel(plan.lastNewDay)}${review}.`
}

/* "It covers all 28 lectures." An exam that takes every lecture has the course's own count
   of topics started, which the path under it shows; one that takes some says its own. */
export function coverage(exam: Exam, lectureCount: number): string {
  const n = exam.lectureIds.length
  const all = n === lectureCount
  const covers = `It covers ${all && n > 1 ? 'all ' : ''}${plural(n, 'lecture')}.`
  const plan = exam.plan
  if (all || !plan || plan.topics === 0 || plan.topicsLeft === 0) return covers
  return `${covers} ${plan.topics - plan.topicsLeft} of its ${plural(plan.topics, 'topic')} started.`
}

/* The exam the page leads with: the nearest one still ahead, or today's. The rest are
   listed under it, in the order the server gave them. */
export function leadExam(exams: readonly Exam[]): Exam | null {
  const ahead = exams.filter(e => e.status !== 'past')
  return ahead.length === 0 ? null : ahead.reduce((a, b) => (b.date < a.date ? b : a))
}

/* the dashboard's headline: the answer to "what do I do today" */
export function headline(lead: Exam | null, dueToday: number, empty: boolean): string {
  if (empty) return 'No concepts yet.'
  if (lead?.plan) return `${todayLine(lead.plan)}.`
  if (lead) return `${lead.name} is today.`
  return dueToday === 0 ? 'Nothing due today.' : `${dueToday} due today.`
}

/* How the course's due count reads beside the exam's plan. The plan counts its own exam's
   topics and the course count is every concept due, so "that makes" is only said when the
   two really are the same number. */
export type DueClause =
  | { kind: 'none' }
  | { kind: 'sum'; due: number }
  | { kind: 'course'; due: number }

export function dueClause(lead: Exam | null, dueToday: number): DueClause {
  if (dueToday === 0) return { kind: 'none' }
  if (lead?.plan && lead.plan.newToday + lead.plan.reviewsToday === dueToday) return { kind: 'sum', due: dueToday }
  return { kind: 'course', due: dueToday }
}
