import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { api, type EvalReport, type ReviewItem } from '../api'
import EvalPage from './EvalPage'

vi.mock('../api', () => ({
  api: {
    evalReport: vi.fn().mockResolvedValue({
      labeled: 40, pctAnswerable: 0.95, pctCorrectAnswer: 0.9, pctUnambiguous: 0.85,
      gradedShortAnswers: 20, graderAgreement: 0.9, needsReview: [],
    }),
  },
}))

// the flagged questions link into the bank, so the page renders inside a router as it does in the app
const renderPage = () => render(<MemoryRouter><EvalPage /></MemoryRouter>)

const flagged = (over: Partial<ReviewItem>): ReviewItem => ({
  questionId: 21, courseId: 2, course: 'CS 149', conceptId: 7, concept: 'Program counter',
  prompt: 'The address of the next instruction is provided by the ______',
  answerable: true, correctAnswer: true, unambiguous: true, ...over,
})

/* thirty-one labeled, as on the real page: one wrong answer key, two ambiguous questions */
const sampleOfThirtyOne: EvalReport = {
  labeled: 31, pctAnswerable: 1, pctCorrectAnswer: 30 / 31, pctUnambiguous: 29 / 31,
  gradedShortAnswers: 1, graderAgreement: 1,
  needsReview: [
    flagged({ correctAnswer: false }),
    flagged({ questionId: 22, conceptId: 8, concept: 'fork', prompt: 'Which call creates a new process?', unambiguous: false }),
    flagged({ questionId: 23, conceptId: 8, concept: 'fork', prompt: 'What does exec replace?', unambiguous: false }),
  ],
}

const check = (title: string) => screen.getByRole('heading', { name: title }).closest('li')!

test('explains what is being evaluated and turns question rates into sample counts', async () => {
  renderPage()
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Question quality' })).toBeInTheDocument())
  expect(screen.getByText(/It does not measure your course grade/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Are the questions ready to study?' })).toBeInTheDocument()
  expect(screen.getByText('38 of 40')).toBeInTheDocument()
  expect(screen.getByText('36 of 40')).toBeInTheDocument()
  expect(screen.getByText('34 of 40')).toBeInTheDocument()
  expect(screen.getByText('95% pass · 2 questions need review')).toBeInTheDocument()
})

test('one question needing review is said in the singular', async () => {
  vi.mocked(api.evalReport).mockResolvedValueOnce(sampleOfThirtyOne)
  renderPage()
  expect(await screen.findByText('97% pass · 1 question needs review')).toBeInTheDocument()
  expect(screen.getByText('94% pass · 2 questions need review')).toBeInTheDocument()
  expect(screen.getByText('100% pass · 0 questions need review')).toBeInTheDocument()
})

test('each check lists the questions it failed, linked to their cards in the bank', async () => {
  vi.mocked(api.evalReport).mockResolvedValueOnce(sampleOfThirtyOne)
  renderPage()
  await screen.findByRole('heading', { name: 'Answer key is correct' })

  const answerKey = check('Answer key is correct')
  expect(within(answerKey).getByText('Review the question')).toBeInTheDocument()
  const link = within(answerKey).getByRole('link', { name: 'The address of the next instruction is provided by the ______' })
  expect(link).toHaveAttribute('href', '/courses/2/bank/7#question-21')
  expect(within(answerKey).getByText('CS 149 · Program counter')).toBeInTheDocument()

  const clarity = check('One clear best answer')
  expect(within(clarity).getByText('Review the 2 questions')).toBeInTheDocument()
  expect(within(clarity).getAllByRole('link').map(a => a.getAttribute('href')))
    .toEqual(['/courses/2/bank/8#question-22', '/courses/2/bank/8#question-23'])

  // a check nothing failed has nothing to review
  expect(within(check('Answerable from the source')).queryByRole('link')).not.toBeInTheDocument()
})

test('says there are no quality checks yet when no questions have labels', async () => {
  vi.mocked(api.evalReport).mockResolvedValueOnce({
    labeled: 0, pctAnswerable: 0, pctCorrectAnswer: 0, pctUnambiguous: 0,
    gradedShortAnswers: 8, graderAgreement: 0.75, needsReview: [],
  })
  renderPage()
  await waitFor(() => expect(screen.getByText(/No question-quality labels yet/i)).toBeInTheDocument())
  expect(screen.queryByText('Answerable from the source')).not.toBeInTheDocument()
  expect(screen.getByText('75% match')).toBeInTheDocument()
})

test('says there is no automatic-grading sample instead of showing a misleading zero percent', async () => {
  vi.mocked(api.evalReport).mockResolvedValueOnce({
    labeled: 12, pctAnswerable: 0.95, pctCorrectAnswer: 0.88, pctUnambiguous: 0.75,
    gradedShortAnswers: 0, graderAgreement: 0, needsReview: [],
  })
  renderPage()
  await waitFor(() => expect(screen.getByText(/No automatically graded short answers yet/i)).toBeInTheDocument())
  expect(screen.queryByText(/0% match/)).not.toBeInTheDocument()
})

test('shows a failed report load in the alert', async () => {
  vi.mocked(api.evalReport).mockRejectedValueOnce(new Error('500 /api/eval/report'))
  renderPage()
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('500 /api/eval/report'))
})

test('keeps singular counts readable', async () => {
  vi.mocked(api.evalReport).mockResolvedValueOnce({
    labeled: 1, pctAnswerable: 1, pctCorrectAnswer: 1, pctUnambiguous: 1,
    gradedShortAnswers: 1, graderAgreement: 1, needsReview: [],
  })
  renderPage()
  await waitFor(() => expect(screen.getAllByText('1 of 1')).toHaveLength(3))
  expect(screen.getByText(/across 1 automatically graded short answer/)).toBeInTheDocument()
})

test('calls out when the automatic-grading sample is still small', async () => {
  renderPage()
  const calibration = (await screen.findByText('90% match')).closest('.calibration')!
  expect(calibration).toHaveClass('calibration--small')
  expect(screen.getByText(/more reliable after 30 graded short answers/)).toBeInTheDocument()
})

test('removes the small-sample warning at thirty graded answers', async () => {
  vi.mocked(api.evalReport).mockResolvedValueOnce({
    labeled: 40, pctAnswerable: 0.95, pctCorrectAnswer: 0.9, pctUnambiguous: 0.85,
    gradedShortAnswers: 30, graderAgreement: 0.9, needsReview: [],
  })
  renderPage()
  const calibration = (await screen.findByText('90% match')).closest('.calibration')!
  expect(calibration).not.toHaveClass('calibration--small')
})
