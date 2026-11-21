import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { api } from './api'
import App from './App'

const overview = [{ id: 2, name: 'CS 149', term: 'Fall 2026', concepts: 248, questions: 844, dueToday: 16, archived: false }]

vi.mock('./api', () => ({
  api: {
    // every test here is about the pages, so the session check finds an account
    auth: {
      me: vi.fn().mockResolvedValue('bryan'),
      config: vi.fn().mockResolvedValue({ inviteRequired: false }),
      logout: vi.fn().mockResolvedValue(undefined),
    },
    overview: vi.fn().mockResolvedValue([
      { id: 2, name: 'CS 149', term: 'Fall 2026', concepts: 248, questions: 844, dueToday: 16, archived: false },
    ]),
    // the bare-course-path test renders the study tab, whose queue call must resolve, not throw
    next: vi.fn().mockResolvedValue(null),
    lectures: vi.fn().mockResolvedValue([]),
    quiz: vi.fn().mockResolvedValue([]),
    quizProgress: vi.fn().mockResolvedValue(null),
    saveQuizProgress: vi.fn().mockImplementation(async (_id, run) => run),
    clearQuizProgress: vi.fn().mockResolvedValue(undefined),
    exams: vi.fn().mockResolvedValue([]),
    createCourse: vi.fn(),
  },
}))

beforeEach(() => vi.mocked(api.overview).mockResolvedValue(overview))
afterEach(() => window.history.pushState({}, '', '/'))

test('renders the wordmark', async () => {
  render(<App />)
  expect(await screen.findByText('Study OS')).toBeInTheDocument()
  await screen.findByRole('heading', { name: 'Courses' })
})

test('the nav carries no eval counts', async () => {
  render(<App />)
  await screen.findByRole('heading', { name: 'Courses' })
  expect(screen.queryByText(/labeled|graded|agreement/)).not.toBeInTheDocument()
})

test('an unknown path lands on the course grid', async () => {
  window.history.pushState({}, '', '/nowhere')
  render(<App />)
  await waitFor(() => expect(window.location.pathname).toBe('/'))
  expect(await screen.findByRole('heading', { name: 'Courses' })).toBeInTheDocument()
})

test('the old top-level study route lands on the course grid too', async () => {
  window.history.pushState({}, '', '/study')
  render(<App />)
  await waitFor(() => expect(window.location.pathname).toBe('/'))
})

test('a bare course path opens that course on Practice, in study mode', async () => {
  window.history.pushState({}, '', '/courses/2')
  render(<App />)
  await waitFor(() => expect(window.location.pathname).toBe('/courses/2/study'))
  expect(await screen.findByRole('heading', { level: 1, name: 'CS 149' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  const modes = await screen.findByRole('navigation', { name: 'Practice mode' })
  expect(within(modes).getByRole('link', { name: 'Study' })).toHaveClass('is-current')
  expect(within(modes).getByRole('link', { name: 'Quiz' })).not.toHaveClass('is-current')
})

test('study and quiz are one Practice tab, and the switch moves between them', async () => {
  window.history.pushState({}, '', '/courses/2/study')
  render(<App />)
  const tabs = await screen.findByRole('navigation', { name: 'Course' })
  expect(within(tabs).queryByRole('link', { name: 'Study' })).not.toBeInTheDocument()
  expect(within(tabs).queryByRole('link', { name: 'Quiz' })).not.toBeInTheDocument()
  expect(within(tabs).getByRole('link', { name: 'Practice' })).toHaveAttribute('aria-current', 'page')

  const modes = await screen.findByRole('navigation', { name: 'Practice mode' })
  await userEvent.click(within(modes).getByRole('link', { name: 'Quiz' }))
  await waitFor(() => expect(window.location.pathname).toBe('/courses/2/quiz'))
  expect(await screen.findByRole('heading', { level: 2, name: 'Quiz' })).toBeInTheDocument()
  expect(within(modes).getByRole('link', { name: 'Quiz' })).toHaveClass('is-current')
  // Practice stays current in quiz mode, and a click on it keeps the mode that is open
  const practice = within(tabs).getByRole('link', { name: 'Practice' })
  expect(practice).toHaveAttribute('aria-current', 'page')
  expect(practice).toHaveAttribute('href', '/courses/2/quiz')

  // and back again from quiz mode
  await userEvent.click(within(modes).getByRole('link', { name: 'Study' }))
  await waitFor(() => expect(window.location.pathname).toBe('/courses/2/study'))
  expect(within(modes).getByRole('link', { name: 'Study' })).toHaveClass('is-current')
  expect(practice).toHaveAttribute('href', '/courses/2/study')
})

test('the old evaluation page is gone, so its address lands on the course grid', async () => {
  window.history.pushState({}, '', '/eval')
  render(<App />)
  await waitFor(() => expect(window.location.pathname).toBe('/'))
  expect(screen.queryByRole('link', { name: 'Evaluation' })).not.toBeInTheDocument()
})

test('a course page renders inside one main landmark, with the nav outside it', async () => {
  window.history.pushState({}, '', '/courses/2/study')
  render(<App />)
  const main = await screen.findByRole('main')
  expect(main).toContainElement(await screen.findByRole('heading', { level: 1, name: 'CS 149' }))
  expect(main).not.toContainElement(screen.getByRole('navigation', { name: 'Primary' }))
})

test('home keeps its own single main landmark', async () => {
  render(<App />)
  await screen.findByRole('heading', { name: 'Courses' })
  expect(screen.getAllByRole('main')).toHaveLength(1)
})
