import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import App from './App'

vi.mock('./api', () => ({
  api: {
    courses: vi.fn().mockResolvedValue([]),
    bank: vi.fn().mockResolvedValue([]),
    upload: vi.fn(),
    retire: vi.fn(),
    createCourse: vi.fn(),
  },
}))

afterEach(() => window.history.pushState({}, '', '/'))

test('renders app title', () => {
  render(<App />)
  expect(screen.getByText('Study OS')).toBeInTheDocument()
})

test('an unknown path lands on the bank instead of an empty content area', async () => {
  window.history.pushState({}, '', '/bank')
  render(<App />)
  await waitFor(() => expect(window.location.pathname).toBe('/'))
  expect(screen.getByText('Question Bank')).toBeInTheDocument()
})
