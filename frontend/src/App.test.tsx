import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { api } from './api'
import App from './App'

vi.mock('./api', () => ({
  api: {
    courses: vi.fn().mockResolvedValue([]),
    bank: vi.fn().mockResolvedValue([]),
    upload: vi.fn(),
    retire: vi.fn(),
    restore: vi.fn(),
    createCourse: vi.fn(),
    evalReport: vi.fn().mockResolvedValue({
      labeled: 31, pctAnswerable: 1, pctCorrectAnswer: 0.97, pctUnambiguous: 0.94,
      gradedShortAnswers: 1, graderAgreement: 1,
    }),
  },
}))

afterEach(() => window.history.pushState({}, '', '/'))

test('renders app title', () => {
  render(<App />)
  expect(screen.getByText('Study OS')).toBeInTheDocument()
})

test('the strip carries the eval counts once they load', async () => {
  render(<App />)
  await waitFor(() => expect(screen.getByText('31 labeled')).toBeInTheDocument())
  expect(screen.getByText('1 graded')).toBeInTheDocument()
  expect(screen.getByText('100% agreement')).toBeInTheDocument()
})

test('a failed eval load leaves the strip showing the brand alone', async () => {
  vi.mocked(api.evalReport).mockRejectedValueOnce(new Error('500'))
  render(<App />)
  await waitFor(() => expect(screen.getByText('Study OS')).toBeInTheDocument())
  expect(screen.queryByText(/labeled/)).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('an unknown path lands on the bank instead of an empty content area', async () => {
  window.history.pushState({}, '', '/bank')
  render(<App />)
  await waitFor(() => expect(window.location.pathname).toBe('/'))
  expect(screen.getByText('Question Bank')).toBeInTheDocument()
})
