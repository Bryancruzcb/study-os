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

test('explains what is being evaluated and turns question rates into sample counts', async () => {
  render(<EvalPage />)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Question quality' })).toBeInTheDocument())
  expect(screen.getByText(/It does not measure your course grade/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Are the questions ready to study?' })).toBeInTheDocument()
  expect(screen.getByText('38 of 40')).toBeInTheDocument()
  expect(screen.getByText('36 of 40')).toBeInTheDocument()
  expect(screen.getByText('34 of 40')).toBeInTheDocument()
  expect(screen.getByText('95% pass · 2 questions need review')).toBeInTheDocument()
})

test('says there are no quality checks yet when no questions have labels', async () => {
  vi.mocked(api.evalReport).mockResolvedValueOnce({
    labeled: 0, pctAnswerable: 0, pctCorrectAnswer: 0, pctUnambiguous: 0,
    gradedShortAnswers: 8, graderAgreement: 0.75,
  })
  render(<EvalPage />)
  await waitFor(() => expect(screen.getByText(/No question-quality labels yet/i)).toBeInTheDocument())
  expect(screen.queryByText('Answerable from the source')).not.toBeInTheDocument()
  expect(screen.getByText('75% match')).toBeInTheDocument()
})

test('says there is no automatic-grading sample instead of showing a misleading zero percent', async () => {
  vi.mocked(api.evalReport).mockResolvedValueOnce({
    labeled: 12, pctAnswerable: 0.95, pctCorrectAnswer: 0.88, pctUnambiguous: 0.75,
    gradedShortAnswers: 0, graderAgreement: 0,
  })
  render(<EvalPage />)
  await waitFor(() => expect(screen.getByText(/No automatically graded short answers yet/i)).toBeInTheDocument())
  expect(screen.queryByText(/0% match/)).not.toBeInTheDocument()
})

test('shows a failed report load in the alert', async () => {
  vi.mocked(api.evalReport).mockRejectedValueOnce(new Error('500 /api/eval/report'))
  render(<EvalPage />)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('500 /api/eval/report'))
})

test('keeps singular counts readable', async () => {
  vi.mocked(api.evalReport).mockResolvedValueOnce({
    labeled: 1, pctAnswerable: 1, pctCorrectAnswer: 1, pctUnambiguous: 1,
    gradedShortAnswers: 1, graderAgreement: 1,
  })
  render(<EvalPage />)
  await waitFor(() => expect(screen.getAllByText('1 of 1')).toHaveLength(3))
  expect(screen.getByText(/across 1 automatically graded short answer/)).toBeInTheDocument()
})

test('calls out when the automatic-grading sample is still small', async () => {
  render(<EvalPage />)
  const calibration = (await screen.findByText('90% match')).closest('.calibration')!
  expect(calibration).toHaveClass('calibration--small')
  expect(screen.getByText(/more reliable after 30 graded short answers/)).toBeInTheDocument()
})

test('removes the small-sample warning at thirty graded answers', async () => {
  vi.mocked(api.evalReport).mockResolvedValueOnce({
    labeled: 40, pctAnswerable: 0.95, pctCorrectAnswer: 0.9, pctUnambiguous: 0.85,
    gradedShortAnswers: 30, graderAgreement: 0.9,
  })
  render(<EvalPage />)
  const calibration = (await screen.findByText('90% match')).closest('.calibration')!
  expect(calibration).not.toHaveClass('calibration--small')
})
