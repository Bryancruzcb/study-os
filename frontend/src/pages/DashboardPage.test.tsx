import { screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { api } from '../api'
import { renderInCourse } from '../test/render'
import DashboardPage from './DashboardPage'

vi.mock('../api', () => ({
  api: {
    overview: vi.fn().mockResolvedValue([
      // deliberately not the schedule's own dueToday below: the tile reads the overview
      { id: 1, name: 'CS 158A', term: 'Fall 2026', concepts: 39, questions: 139, dueToday: 7 },
    ]),
    dashboard: vi.fn().mockResolvedValue({
      dueToday: 2,
      concepts: [
        { conceptId: 5, name: 'TCP', streak: 1, attempts: 4, correct: 3, dueDate: '2026-09-04', neverAttempted: false },
        { conceptId: 6, name: 'UDP', streak: 0, attempts: 0, correct: 0, dueDate: '2026-09-05', neverAttempted: true },
      ],
    }),
  },
}))

const figure = (label: string) => screen.getByText(label).closest('li')!

test('renders the three figures from the course and the concept rows', async () => {
  renderInCourse(<DashboardPage />, 'dashboard')
  await waitFor(() => expect(screen.getByText('TCP')).toBeInTheDocument())
  expect(figure('due today')).toHaveTextContent('7')
  expect(figure('concepts')).toHaveTextContent('39')
  expect(figure('questions')).toHaveTextContent('139')
  expect(screen.getByText('3/4')).toBeInTheDocument()
  expect(screen.getByText('UDP').closest('tr')).toHaveClass('is-new')
  expect(screen.getByText('(new)')).toBeInTheDocument()
})

test('an empty schedule says so inside the card', async () => {
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
