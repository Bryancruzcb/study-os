import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { api } from '../api'
import EvalPage from './EvalPage'

vi.mock('../api', () => ({
  api: {
    evalReport: vi.fn().mockResolvedValue({
      labeled: 40, pctAnswerable: 0.95, pctCorrectAnswer: 0.9, pctUnambiguous: 0.85,
      gradedShortAnswers: 20, graderAgreement: 0.9,
    }),
  },
}))

test('renders eval metrics', async () => {
  render(<EvalPage />)
  await waitFor(() => expect(screen.getByText(/40 labeled/)).toBeInTheDocument())
  expect(screen.getByText(/95%/)).toBeInTheDocument()
  expect(screen.getByText(/90%.*agreement/)).toBeInTheDocument()
})

test('says there is no grader agreement to report when nothing was graded', async () => {
  vi.mocked(api.evalReport).mockResolvedValueOnce({
    labeled: 12, pctAnswerable: 0.95, pctCorrectAnswer: 0.88, pctUnambiguous: 0.75,
    gradedShortAnswers: 0, graderAgreement: 0,
  })
  render(<EvalPage />)
  await waitFor(() => expect(screen.getByText(/no graded short answers yet/i)).toBeInTheDocument())
  expect(screen.queryByText(/agreement/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/0%/)).not.toBeInTheDocument()
})

test('shows a failed report load in the alert', async () => {
  vi.mocked(api.evalReport).mockRejectedValueOnce(new Error('500 /api/eval/report'))
  render(<EvalPage />)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('500 /api/eval/report'))
})

test('says nothing is labelled yet instead of three 0% label rates', async () => {
  vi.mocked(api.evalReport).mockResolvedValueOnce({
    labeled: 0, pctAnswerable: 0, pctCorrectAnswer: 0, pctUnambiguous: 0,
    gradedShortAnswers: 8, graderAgreement: 0.75,
  })
  render(<EvalPage />)
  await waitFor(() => expect(screen.getByText(/no labeled questions yet/i)).toBeInTheDocument())
  expect(screen.queryByText(/answerable/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/0%/)).not.toBeInTheDocument()
  expect(screen.getByText(/75%.*agreement/)).toBeInTheDocument()
})

test('counts read as singular when there is exactly one of a thing', async () => {
  vi.mocked(api.evalReport).mockResolvedValueOnce({
    labeled: 1, pctAnswerable: 1, pctCorrectAnswer: 1, pctUnambiguous: 1,
    gradedShortAnswers: 1, graderAgreement: 1,
  })
  render(<EvalPage />)
  await waitFor(() => expect(screen.getByText('1 labeled question')).toBeInTheDocument())
  expect(screen.getByText(/^1 graded short answer,/)).toBeInTheDocument()
})
