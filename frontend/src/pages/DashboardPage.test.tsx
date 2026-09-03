import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import DashboardPage from './DashboardPage'

vi.mock('../api', () => ({
  api: {
    courses: vi.fn().mockResolvedValue([{ id: 1, name: 'CS 158A', term: 'Fall 2026' }]),
    dashboard: vi.fn().mockResolvedValue({
      dueToday: 2,
      concepts: [{ conceptId: 5, name: 'TCP', streak: 1, attempts: 4, correct: 3, dueDate: '2026-09-04', neverAttempted: false }],
    }),
  },
}))

test('renders due count and concept rows', async () => {
  render(<DashboardPage />)
  await waitFor(() => expect(screen.getByText(/2 due today/)).toBeInTheDocument())
  expect(screen.getByText('TCP')).toBeInTheDocument()
  expect(screen.getByText('3/4')).toBeInTheDocument()
})
