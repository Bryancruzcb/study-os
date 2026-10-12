import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { api, type ConceptStats } from '../api'
import { renderInCourse } from '../test/render'
import DashboardPage from './DashboardPage'

vi.mock('../api', () => ({
  api: {
    overview: vi.fn().mockResolvedValue([
      // deliberately not the schedule's own dueToday below: the figure reads the overview
      { id: 1, name: 'CS 158A', term: 'Fall 2026', concepts: 39, questions: 139, dueToday: 7, archived: false },
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
  screen.getByRole('heading', { level: 3, name }).closest<HTMLElement>('.path-node')!
const section = async (title: string) => (await screen.findByRole('heading', { name: title })).closest('section')!
const path = () => screen.findByRole('heading', { name: /^Your path through/ })

test('the figures say what is due, how much is right, and what is left to do', async () => {
  renderInCourse(<DashboardPage />, 'dashboard')
  await waitFor(() => expect(figure('to work on')).toHaveTextContent('2'))
  expect(figure('due today')).toHaveTextContent('7')
  // four of the seven graded answers, with the answers it rests on
  expect(figure('correct, 4 of 7 answers')).toHaveTextContent('57%')
  expect(figure('not started')).toHaveTextContent('1')
})

test('nothing graded is no percent correct at all', async () => {
  vi.mocked(api.dashboard).mockResolvedValueOnce({ dueToday: 1, concepts: [stats({ conceptId: 6, name: 'UDP' })] })
  renderInCourse(<DashboardPage />, 'dashboard')
  await screen.findByText('Answer a few questions and the concepts to work on will show up here.')
  expect(screen.queryByText(/^correct/)).not.toBeInTheDocument()
})

test('the main button starts studying', async () => {
  renderInCourse(<DashboardPage />, 'dashboard')
  expect(await screen.findByRole('link', { name: 'Start studying' })).toHaveAttribute('href', '/courses/1/study')
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

test('only the five weakest lead the page, and a few more are named', async () => {
  const weak = Array.from({ length: 7 }, (_, i) =>
    stats({ conceptId: 20 + i, name: `Weak ${i}`, attempts: 2, correct: i % 2, neverAttempted: false }))
  vi.mocked(api.dashboard).mockResolvedValueOnce({ dueToday: 1, concepts: weak })
  renderInCourse(<DashboardPage />, 'dashboard')
  const focus = await section('Work on these next')
  expect(within(focus).getAllByRole('link')).toHaveLength(5)
  expect(within(focus).getByText('2 more to work on: Weak 3 (1 of 2 right) and Weak 5 (1 of 2 right).')).toBeInTheDocument()
})

test('many more than five are counted and left to the path', async () => {
  const weak = Array.from({ length: 10 }, (_, i) =>
    stats({ conceptId: 20 + i, name: `Weak ${i}`, attempts: 1, correct: 0, neverAttempted: false }))
  vi.mocked(api.dashboard).mockResolvedValueOnce({ dueToday: 1, concepts: weak })
  renderInCourse(<DashboardPage />, 'dashboard')
  const focus = await section('Work on these next')
  expect(within(focus).getByText('5 more concepts to work on, marked on the path below.')).toBeInTheDocument()
})

test('every lecture sits on the path: its share correct and how its concepts stand, in words', async () => {
  renderInCourse(<DashboardPage />, 'dashboard')
  expect(await path()).toHaveTextContent('Your path through 2 lectures')
  expect(screen.getByText('3 of 4 topics started.')).toBeInTheDocument()
  expect(screen.getByText('How this is counted')).toBeInTheDocument()
  expect(lectureNames()).toEqual(['Lecture 3', 'Lecture 4'])
  const three = within(lecture('Lecture 3'))
  expect(three.getByText('2 topics')).toBeInTheDocument()
  expect(three.getByText('75% correct')).toBeInTheDocument()
  expect(three.getByText('1 right')).toBeInTheDocument()
  expect(three.getByText('0 to work on')).toBeInTheDocument()
  expect(three.getByText('1 not started')).toBeInTheDocument()
  const four = within(lecture('Lecture 4'))
  expect(four.getByText('33% correct')).toBeInTheDocument()
  expect(four.getByText('2 to work on')).toBeInTheDocument()
})

test('a lecture nobody has started says so, and the work picks up at the first lecture to work on', async () => {
  vi.mocked(api.dashboard).mockResolvedValueOnce({
    dueToday: 2,
    concepts: [stats({ conceptId: 9, name: 'Framing', lecture: 'Lecture 2.pdf' }), ...concepts],
  })
  renderInCourse(<DashboardPage />, 'dashboard')
  await path()
  expect(within(lecture('Lecture 2')).getByText('not started')).toBeInTheDocument()
  expect(lecture('Lecture 2')).not.toHaveClass('is-here')
  expect(lecture('Lecture 4')).toHaveClass('is-here')
  expect(within(lecture('Lecture 4')).getByText('Pick up here')).toBeInTheDocument()
  expect(screen.getAllByText('Pick up here')).toHaveLength(1)
})

test('a lecture opens to its own concepts, weakest first, each linked to its questions', async () => {
  renderInCourse(<DashboardPage />, 'dashboard')
  await path()
  const four = lecture('Lecture 4')
  expect(within(four).getByText('See its 2 concepts')).toBeInTheDocument()
  // the table names the file the concepts came from
  expect(within(four).getByRole('table', { name: 'Lecture 4.pdf' })).toBeInTheDocument()
  const names = within(four).getAllByRole('row').slice(1).map(tr => within(tr).getByRole('link').textContent)
  expect(names).toEqual(['Congestion', 'Routing'])
  expect(within(four).getByText('slide 12')).toBeInTheDocument()
  expect(within(four).getByText('Congestion').closest('tr')).toHaveClass('is-weak')
  expect(within(four).getAllByText('needs work')).toHaveLength(2)
  const three = lecture('Lecture 3')
  expect(within(three).getByText('UDP').closest('tr')).toHaveClass('is-new')
  expect(within(three).getByText('new')).toBeInTheDocument()
  expect(within(three).getByRole('link', { name: 'TCP' })).toHaveAttribute('href', '/courses/1/bank/5')
  expect(within(three).getAllByText('Sat, Sep 5', { selector: 'td' })).toHaveLength(2)
})

test('every lecture is on one path, with no pages to turn', async () => {
  const many = Array.from({ length: 28 }, (_, i) =>
    stats({ conceptId: 40 + i, name: `Topic ${i}`, lecture: `Lecture ${i + 1}.pdf` }))
  vi.mocked(api.dashboard).mockResolvedValueOnce({ dueToday: 0, concepts: many })
  renderInCourse(<DashboardPage />, 'dashboard')
  expect(await path()).toHaveTextContent('Your path through 28 lectures')
  expect(lectureNames()).toHaveLength(28)
  expect(screen.queryByText(/^Page \d+ of/)).not.toBeInTheDocument()
})

test('an empty schedule says so and points at the bank', async () => {
  vi.mocked(api.dashboard).mockResolvedValueOnce({ dueToday: 0, concepts: [] })
  renderInCourse(<DashboardPage />, 'dashboard')
  expect(await screen.findByRole('heading', { name: 'No concepts yet.' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Upload a lecture PDF' })).toHaveAttribute('href', '/courses/1/bank')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Work on these next' })).not.toBeInTheDocument()
})

test('while it loads, the page holds the shape of what lands', async () => {
  vi.mocked(api.dashboard).mockReturnValueOnce(new Promise(() => {}))
  renderInCourse(<DashboardPage />, 'dashboard')
  await waitFor(() => expect(document.querySelector('.plan[aria-busy="true"]')).toBeInTheDocument())
  expect(document.querySelectorAll('.skeleton').length).toBeGreaterThan(5)
})

test('shows an alert when the dashboard load fails, and tries again', async () => {
  vi.mocked(api.dashboard).mockRejectedValueOnce(new Error('500 /api/dashboard'))
  renderInCourse(<DashboardPage />, 'dashboard')
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('500 /api/dashboard'))
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await path()).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
