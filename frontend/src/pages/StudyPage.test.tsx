import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { api, type Attempt, type StudyQuestion } from '../api'
import { renderInCourse } from '../test/render'
import StudyPage from './StudyPage'

const course = { id: 1, name: 'CS 158A', term: 'Fall 2026', concepts: 39, questions: 139, dueToday: 16 }

vi.mock('../api', () => ({
  api: {
    overview: vi.fn(),
    next: vi.fn(),
    answer: vi.fn(),
    override: vi.fn(),
    selfGrade: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.overview).mockResolvedValue([course])
  vi.mocked(api.next).mockResolvedValue({
    id: 9, type: 'MC', prompt: 'Steps in the TCP handshake?', options: ['1', '2', '3', '4'], sourcePages: '3',
  })
  vi.mocked(api.answer).mockResolvedValue({ id: 1, verdict: 'CORRECT', score: 1, feedback: null })
})

const shortAnswer: StudyQuestion = {
  id: 10, type: 'SHORT_ANSWER', prompt: 'Describe the handshake.', options: [], sourcePages: '3,4',
}

async function renderWithQuestion() {
  renderInCourse(<StudyPage />, 'study')
  await waitFor(() => expect(screen.getByText('Steps in the TCP handshake?')).toBeInTheDocument())
}

async function renderShortAnswer(attempt: Attempt) {
  vi.mocked(api.next).mockResolvedValueOnce(shortAnswer)
  vi.mocked(api.answer).mockResolvedValueOnce(attempt)
  renderInCourse(<StudyPage />, 'study')
  await waitFor(() => expect(screen.getByText('Describe the handshake.')).toBeInTheDocument())
  await userEvent.type(screen.getByRole('textbox'), 'SYN then SYN-ACK')
  await userEvent.click(screen.getByRole('button', { name: /submit/i }))
}

test('shows the question with its type and pages, submits an MC answer, shows the verdict', async () => {
  await renderWithQuestion()
  expect(screen.getByText('Multiple choice')).toBeInTheDocument()
  expect(screen.getByText('pp. 3')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
  expect(screen.getByText('You picked C: 3')).toBeInTheDocument()
  expect(api.answer).toHaveBeenCalledWith({ questionId: 9, answerIndex: 2 })
})

test('the head figure shows what is left and the overview is refetched after an answer', async () => {
  await renderWithQuestion()
  expect(screen.getByText('left today').previousElementSibling).toHaveTextContent('16')
  vi.mocked(api.overview).mockResolvedValueOnce([{ ...course, dueToday: 15 }])
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(api.overview).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByText('left today').previousElementSibling).toHaveTextContent('15'))
})

test('empty state when nothing due, with a way to the bank', async () => {
  vi.mocked(api.next).mockResolvedValueOnce(null)
  renderInCourse(<StudyPage />, 'study')
  await waitFor(() => expect(screen.getByText(/Nothing due/)).toBeInTheDocument())
  expect(screen.getByRole('link', { name: 'Open the bank' })).toHaveAttribute('href', '/courses/1/bank')
})

test('shows an alert when loading the next question fails', async () => {
  vi.mocked(api.next).mockRejectedValueOnce(new Error('500 /api/study/next'))
  renderInCourse(<StudyPage />, 'study')
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('500 /api/study/next'))
})

test('shows an alert when answering fails', async () => {
  vi.mocked(api.answer).mockRejectedValueOnce(new Error('500 /api/study/answer'))
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('500 /api/study/answer'))
  expect(screen.getByRole('button', { name: '3' })).toBeEnabled()
})

test('ignores a second click while an answer is pending', async () => {
  let resolveAnswer!: (a: Attempt) => void
  vi.mocked(api.answer).mockReturnValueOnce(new Promise<Attempt>(r => { resolveAnswer = r }))
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await userEvent.click(screen.getByRole('button', { name: '4' }))
  expect(api.answer).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: '4' })).toBeDisabled()
  resolveAnswer({ id: 1, verdict: 'CORRECT', score: 1, feedback: null })
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
})

test('keeps the graded question locked when loading the next one fails', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
  vi.mocked(api.next).mockRejectedValueOnce(new Error('500 /api/study/next'))
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('500 /api/study/next'))
  expect(screen.getByText(/Correct/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next question' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '3' })).not.toBeInTheDocument()
  expect(api.answer).toHaveBeenCalledTimes(1)
})

test('short answer flow shows the submitted text, the verdict, the feedback and the override', async () => {
  await renderShortAnswer({ id: 2, verdict: 'INCORRECT', score: 0.4, feedback: 'Missed ACK.' })
  await waitFor(() => expect(screen.getByText(/Incorrect/)).toBeInTheDocument())
  expect(screen.getByText('SYN then SYN-ACK')).toBeInTheDocument()
  expect(screen.getByText('Grader: Missed ACK.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /I was actually right/i })).toBeInTheDocument()
  expect(api.answer).toHaveBeenCalledWith({ questionId: 10, answerText: 'SYN then SYN-ACK' })
})

test('pending verdict offers self-grade', async () => {
  await renderShortAnswer({ id: 2, verdict: 'PENDING', score: null, feedback: null })
  await waitFor(() => expect(screen.getByText(/grader unavailable/i)).toBeInTheDocument())
  expect(screen.getByRole('button', { name: /I got it right/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /I got it wrong/i })).toBeInTheDocument()
})

test('shows an alert when self-grading fails and keeps the self-grade buttons', async () => {
  vi.mocked(api.selfGrade).mockRejectedValueOnce(new Error('500 /api/study/attempts/2/self-grade'))
  await renderShortAnswer({ id: 2, verdict: 'PENDING', score: null, feedback: null })
  await waitFor(() => expect(screen.getByRole('button', { name: /I got it right/i })).toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: /I got it right/i }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('500 /api/study/attempts/2/self-grade'))
  expect(api.selfGrade).toHaveBeenCalledWith(2, true)
  expect(screen.getByRole('button', { name: /I got it right/i })).toBeEnabled()
  expect(screen.getByRole('button', { name: /I got it wrong/i })).toBeEnabled()
})

test('disables Next question while a self-grade is in flight', async () => {
  let resolveSelfGrade!: (a: Attempt) => void
  vi.mocked(api.selfGrade).mockReturnValueOnce(new Promise<Attempt>(r => { resolveSelfGrade = r }))
  await renderShortAnswer({ id: 2, verdict: 'PENDING', score: null, feedback: null })
  await waitFor(() => expect(screen.getByRole('button', { name: /I got it right/i })).toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: /I got it right/i }))
  expect(screen.getByRole('button', { name: 'Next question' })).toBeDisabled()
  resolveSelfGrade({ id: 2, verdict: 'CORRECT', score: 1, feedback: null })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next question' })).toBeEnabled())
  expect(api.next).toHaveBeenCalledTimes(1)
})

test('ignores a second Next question click while the next question is loading', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
  let resolveNext!: (q: StudyQuestion | null) => void
  vi.mocked(api.next).mockClear()
  vi.mocked(api.next).mockReturnValueOnce(new Promise<StudyQuestion | null>(r => { resolveNext = r }))
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  expect(api.next).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Next question' })).toBeDisabled()
  resolveNext(null)
  await waitFor(() => expect(screen.getByText(/Nothing due/)).toBeInTheDocument())
})

test('will not send a blank or whitespace-only short answer to the grader', async () => {
  vi.mocked(api.next).mockResolvedValueOnce(shortAnswer)
  renderInCourse(<StudyPage />, 'study')
  await waitFor(() => expect(screen.getByText('Describe the handshake.')).toBeInTheDocument())
  expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: /submit/i }))
  await userEvent.type(screen.getByRole('textbox'), '   ')
  expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: /submit/i }))
  expect(api.answer).not.toHaveBeenCalled()
  await userEvent.clear(screen.getByRole('textbox'))
  await userEvent.type(screen.getByRole('textbox'), '  SYN then SYN-ACK  ')
  expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled()
  await userEvent.click(screen.getByRole('button', { name: /submit/i }))
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
  // the padding is gated on the trim, so it is not part of what gets billed and stored
  expect(api.answer).toHaveBeenCalledWith({ questionId: 10, answerText: 'SYN then SYN-ACK' })
})

test('shows no page chip for a question with no source pages', async () => {
  vi.mocked(api.next).mockResolvedValueOnce({
    id: 11, type: 'MC', prompt: 'Steps in the TCP handshake?', options: ['1', '2', '3', '4'], sourcePages: null,
  })
  renderInCourse(<StudyPage />, 'study')
  await waitFor(() => expect(screen.getByText('Steps in the TCP handshake?')).toBeInTheDocument())
  expect(screen.queryByText(/pp\./)).not.toBeInTheDocument()
})

test('grading hands focus to the verdict band, so the next Tab reaches its buttons', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  const band = (await screen.findByText(/Correct/)).closest('.verdict')!
  await waitFor(() => expect(band).toHaveFocus())
})

test('a self-grade hands focus to the verdict that replaces the pending band', async () => {
  vi.mocked(api.selfGrade).mockResolvedValueOnce({ id: 2, verdict: 'CORRECT', score: 1, feedback: null })
  await renderShortAnswer({ id: 2, verdict: 'PENDING', score: null, feedback: null })
  await userEvent.click(await screen.findByRole('button', { name: /I got it right/i }))
  const band = (await screen.findByText(/Correct/)).closest('.verdict')!
  await waitFor(() => expect(band).toHaveFocus())
})

test('Next question puts focus on the first option', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '1' })).toHaveFocus())
})

test('Next question puts focus in the textarea when a short answer comes up', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
  vi.mocked(api.next).mockResolvedValueOnce(shortAnswer)
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus())
})

test('when the queue runs out after Next question, focus lands on the way to the bank', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
  vi.mocked(api.next).mockResolvedValueOnce(null)
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  await waitFor(() => expect(screen.getByRole('link', { name: 'Open the bank' })).toHaveFocus())
})
