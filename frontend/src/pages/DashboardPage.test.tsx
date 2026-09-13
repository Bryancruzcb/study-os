import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { api, type ConceptStats } from '../api'
import { renderInCourse } from '../test/render'
import DashboardPage from './DashboardPage'

vi.mock('../api', () => ({
  api: {
    overview: vi.fn().mockResolvedValue([
      // deliberately not the schedule's own dueToday below: the tile reads the overview
      { id: 1, name: 'CS 158A', term: 'Fall 2026', concepts: 39, questions: 139, dueToday: 7 },
    ]),
    dashboard: vi.fn(),
    exams: vi.fn().mockResolvedValue([]),
    lectures: vi.fn().mockResolvedValue([]),
  },
}))

const stats = (over: Partial<ConceptStats>): ConceptStats => ({
  conceptId: 1, name: 'Concept', lecture: 'Lecture 3.pdf', sourcePages: '3', streak: 0,
  attempts: 0, correct: 0, dueDate: '2026-09-05', neverAttempted: true, ...over,
})

/* two lectures: in the first a concept answered right last time and one never started, in the
   second two concepts whose last answer was wrong */
const concepts = [
  stats({ conceptId: 5, name: 'TCP', sourcePages: '3,4', streak: 1, attempts: 4, correct: 3, neverAttempted: false }),
  stats({ conceptId: 6, name: 'UDP', sourcePages: '7' }),
  stats({ conceptId: 7, name: 'Routing', lecture: 'Lecture 4.pdf', sourcePages: '12', attempts: 2, correct: 1, neverAttempted: false }),
  stats({ conceptId: 8, name: 'Congestion', lecture: 'Lecture 4.pdf', sourcePages: null, attempts: 1, correct: 0, neverAttempted: false }),
]

beforeEach(() => {
  vi.mocked(api.dashboard).mockResolvedValue({ dueToday: 2, concepts })
})

const figure = (label: string) => screen.getByText(label).closest('li')!
const lectureNames = () => [...document.querySelectorAll('.lecture-name')].map(el => el.textContent)
const lecture = (name: string) =>
  screen.getByText(name, { selector: '.lecture-name' }).closest<HTMLElement>('.lecture')!
const section = async (title: string) => (await screen.findByRole('heading', { name: title })).closest('section')!

test('the figures say what is due, how much is right, and what is left to do', async () => {
  renderInCourse(<DashboardPage />, 'dashboard')
  await waitFor(() => expect(figure('to work on')).toHaveTextContent('2'))
  expect(figure('due today')).toHaveTextContent('7')
  // four of the seven graded answers
  expect(figure('correct')).toHaveTextContent('57%')
  expect(figure('not started')).toHaveTextContent('1')
})

test('nothing graded is no percent correct at all', async () => {
  vi.mocked(api.dashboard).mockResolvedValueOnce({ dueToday: 1, concepts: [stats({ conceptId: 6, name: 'UDP' })] })
  renderInCourse(<DashboardPage />, 'dashboard')
  await screen.findByText('Answer a few questions and the concepts to work on will show up here.')
  expect(screen.queryByText('correct')).not.toBeInTheDocument()
})

test('the concepts to work on lead the page, weakest first, each with its lecture and slides', async () => {
  renderInCourse(<DashboardPage />, 'dashboard')
  const focus = await section('Work on these next')
  const links = within(focus).getAllByRole('link')
  expect(links.map(a => a.textContent)).toEqual(['Congestion', 'Routing'])
  expect(links[1]).toHaveAttribute('href', '/courses/1/bank/7')
  expect(within(focus).getByText('Lecture 4.pdf · slide 12')).toBeInTheDocument()
  expect(within(focus).getByText('0 of 1 right')).toBeInTheDocument()
  // right last time, or never tried, is not something to work on
  expect(within(focus).queryByText('TCP')).not.toBeInTheDocument()
  expect(within(focus).queryByText('UDP')).not.toBeInTheDocument()
})

test('with every tried concept right last time, there is nothing to work on', async () => {
  vi.mocked(api.dashboard).mockResolvedValueOnce({ dueToday: 1, concepts: [concepts[0], concepts[1]] })
  renderInCourse(<DashboardPage />, 'dashboard')
  expect(await screen.findByText(/^Nothing to work on/)).toBeInTheDocument()
})

test('only the five weakest lead the page, and the rest are counted', async () => {
  const weak = Array.from({ length: 7 }, (_, i) =>
    stats({ conceptId: 20 + i, name: `Weak ${i}`, attempts: 2, correct: i % 2, neverAttempted: false }))
  vi.mocked(api.dashboard).mockResolvedValueOnce({ dueToday: 1, concepts: weak })
  renderInCourse(<DashboardPage />, 'dashboard')
  const focus = await section('Work on these next')
  expect(within(focus).getAllByRole('link')).toHaveLength(5)
  expect(within(focus).getByText('2 more concepts to work on, marked in the lectures below.')).toBeInTheDocument()
})

test('each lecture gets one row: its share correct and how its concepts stand, in words', async () => {
  renderInCourse(<DashboardPage />, 'dashboard')
  await screen.findByRole('heading', { name: 'By lecture' })
  expect(lectureNames()).toEqual(['Lecture 3.pdf', 'Lecture 4.pdf'])
  expect(lecture('Lecture 3.pdf')).toHaveTextContent('75% correct')
  expect(lecture('Lecture 3.pdf')).toHaveTextContent('1 right · 0 to work on · 1 not started')
  expect(lecture('Lecture 4.pdf')).toHaveTextContent('33% correct')
  expect(lecture('Lecture 4.pdf')).toHaveTextContent('0 right · 2 to work on · 0 not started')
})

test('a lecture opens to its own concepts, weakest first, each linked to its questions', async () => {
  renderInCourse(<DashboardPage />, 'dashboard')
  await screen.findByRole('heading', { name: 'By lecture' })
  const four = lecture('Lecture 4.pdf')
  const names = within(four).getAllByRole('row').slice(1).map(tr => within(tr).getByRole('link').textContent)
  expect(names).toEqual(['Congestion', 'Routing'])
  expect(within(four).getByText('slide 12')).toBeInTheDocument()
  expect(within(four).getByText('Congestion').closest('tr')).toHaveClass('is-weak')
  const three = lecture('Lecture 3.pdf')
  expect(within(three).getByText('UDP').closest('tr')).toHaveClass('is-new')
  expect(within(three).getByText('(new)')).toBeInTheDocument()
  expect(within(three).getByRole('link', { name: 'TCP' })).toHaveAttribute('href', '/courses/1/bank/5')
})

test('lectures come eight to a page, with a way to the rest', async () => {
  const many = Array.from({ length: 10 }, (_, i) =>
    stats({ conceptId: 40 + i, name: `Topic ${i}`, lecture: `Lecture ${i + 1}.pdf` }))
  vi.mocked(api.dashboard).mockResolvedValueOnce({ dueToday: 0, concepts: many })
  renderInCourse(<DashboardPage />, 'dashboard')
  await screen.findByText('Page 1 of 2')
  expect(lectureNames()).toHaveLength(8)
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

  await userEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
  expect(lectureNames()).toEqual(['Lecture 9.pdf', 'Lecture 10.pdf'])
  // Next has nowhere further to go, so the caret is on the first lecture of the page it opened
  expect(document.querySelector('.lecture-head')).toHaveFocus()
})

test('a course with a few lectures has no pages to turn', async () => {
  renderInCourse(<DashboardPage />, 'dashboard')
  await screen.findByRole('heading', { name: 'By lecture' })
  expect(screen.queryByText(/^Page \d+ of/)).not.toBeInTheDocument()
})

test('an empty schedule says so', async () => {
  vi.mocked(api.dashboard).mockResolvedValueOnce({ dueToday: 0, concepts: [] })
  renderInCourse(<DashboardPage />, 'dashboard')
  expect(await screen.findByText('No concepts yet.')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test('shows an alert when the dashboard load fails', async () => {
  vi.mocked(api.dashboard).mockRejectedValueOnce(new Error('500 /api/dashboard'))
  renderInCourse(<DashboardPage />, 'dashboard')
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('500 /api/dashboard'))
})
