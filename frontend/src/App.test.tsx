import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { api } from './api'
import App from './App'

const overview = [{ id: 2, name: 'CS 149', term: 'Fall 2026', concepts: 248, questions: 844, dueToday: 16 }]

vi.mock('./api', () => ({
  api: {
    overview: vi.fn().mockResolvedValue([
      { id: 2, name: 'CS 149', term: 'Fall 2026', concepts: 248, questions: 844, dueToday: 16 },
    ]),
    courses: vi.fn().mockResolvedValue([{ id: 2, name: 'CS 149', term: 'Fall 2026' }]),
    next: vi.fn().mockResolvedValue(null),
    bank: vi.fn().mockResolvedValue([]),
    dashboard: vi.fn().mockResolvedValue({ dueToday: 0, concepts: [] }),
    createCourse: vi.fn(),
    evalReport: vi.fn().mockResolvedValue({
      labeled: 31, pctAnswerable: 1, pctCorrectAnswer: 0.97, pctUnambiguous: 0.94,
      gradedShortAnswers: 1, graderAgreement: 1,
    }),
  },
}))

beforeEach(() => vi.mocked(api.overview).mockResolvedValue(overview))
afterEach(() => window.history.pushState({}, '', '/'))

test('renders the wordmark', async () => {
  render(<App />)
  expect(screen.getByText('Study OS')).toBeInTheDocument()
  await screen.findByRole('heading', { name: 'Courses' })
})

test('the nav carries the eval counts once they load', async () => {
  render(<App />)
  await waitFor(() => expect(screen.getByText('31 labeled')).toBeInTheDocument())
  expect(screen.getByText('1 graded')).toBeInTheDocument()
  expect(screen.getByText('100% agreement')).toBeInTheDocument()
})

test('a failed eval load leaves the nav showing the brand and links alone', async () => {
  vi.mocked(api.evalReport).mockRejectedValueOnce(new Error('500'))
  render(<App />)
  await screen.findByRole('heading', { name: 'Courses' })
  expect(screen.queryByText(/labeled/)).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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

test('a bare course path opens that course on its study tab', async () => {
  window.history.pushState({}, '', '/courses/2')
  render(<App />)
  await waitFor(() => expect(window.location.pathname).toBe('/courses/2/study'))
  expect(await screen.findByRole('heading', { level: 1, name: 'CS 149' })).toBeInTheDocument()
})
