import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import StudyPage from './StudyPage'
import { api, type Attempt } from '../api'

vi.mock('../api', () => ({
  api: {
    courses: vi.fn().mockResolvedValue([{ id: 1, name: 'CS 158A', term: 'Fall 2026' }]),
    next: vi.fn().mockResolvedValue({
      id: 9, type: 'MC', prompt: 'Steps in the TCP handshake?', options: ['1', '2', '3', '4'], sourcePages: '3',
    }),
    answer: vi.fn().mockResolvedValue({ id: 1, verdict: 'CORRECT', score: 1, feedback: null }),
    override: vi.fn(),
    selfGrade: vi.fn(),
  },
}))

beforeEach(() => vi.clearAllMocks())

async function renderWithQuestion() {
  render(<StudyPage />)
  await waitFor(() => expect(screen.getByText('Steps in the TCP handshake?')).toBeInTheDocument())
}

test('shows question, submits MC answer, shows verdict', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByText(/CORRECT/)).toBeInTheDocument())
  expect(api.answer).toHaveBeenCalledWith({ questionId: 9, answerIndex: 2 })
})

test('empty state when nothing due', async () => {
  vi.mocked(api.next).mockResolvedValueOnce(null)
  render(<StudyPage />)
  await waitFor(() => expect(screen.getByText(/Nothing due/)).toBeInTheDocument())
})

test('shows an alert when loading the next question fails', async () => {
  vi.mocked(api.next).mockRejectedValueOnce(new Error('500 /api/study/next'))
  render(<StudyPage />)
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
  await waitFor(() => expect(screen.getByText(/CORRECT/)).toBeInTheDocument())
})

test('keeps the graded question locked when loading the next one fails', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByText(/CORRECT/)).toBeInTheDocument())
  vi.mocked(api.next).mockRejectedValueOnce(new Error('500 /api/study/next'))
  await userEvent.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('500 /api/study/next'))
  expect(screen.getByText(/CORRECT/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '3' })).not.toBeInTheDocument()
  expect(api.answer).toHaveBeenCalledTimes(1)
})

test('short answer flow with override button', async () => {
  vi.mocked(api.next).mockResolvedValueOnce({
    id: 10, type: 'SHORT_ANSWER', prompt: 'Describe the handshake.', options: [], sourcePages: '3,4',
  })
  vi.mocked(api.answer).mockResolvedValueOnce({ id: 2, verdict: 'INCORRECT', score: 0.4, feedback: 'Missed ACK.' })
  render(<StudyPage />)
  await waitFor(() => expect(screen.getByText('Describe the handshake.')).toBeInTheDocument())
  await userEvent.type(screen.getByRole('textbox'), 'SYN then SYN-ACK')
  await userEvent.click(screen.getByRole('button', { name: /submit/i }))
  await waitFor(() => expect(screen.getByText(/INCORRECT/)).toBeInTheDocument())
  expect(screen.getByText(/Missed ACK/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /I was actually right/i })).toBeInTheDocument()
  expect(api.answer).toHaveBeenCalledWith({ questionId: 10, answerText: 'SYN then SYN-ACK' })
})

test('pending verdict offers self-grade', async () => {
  vi.mocked(api.next).mockResolvedValueOnce({
    id: 10, type: 'SHORT_ANSWER', prompt: 'Describe the handshake.', options: [], sourcePages: '3,4',
  })
  vi.mocked(api.answer).mockResolvedValueOnce({ id: 2, verdict: 'PENDING', score: null, feedback: null })
  render(<StudyPage />)
  await waitFor(() => expect(screen.getByText('Describe the handshake.')).toBeInTheDocument())
  await userEvent.type(screen.getByRole('textbox'), 'SYN then SYN-ACK')
  await userEvent.click(screen.getByRole('button', { name: /submit/i }))
  await waitFor(() => expect(screen.getByText(/grader unavailable/i)).toBeInTheDocument())
  expect(screen.getByRole('button', { name: /I got it right/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /I got it wrong/i })).toBeInTheDocument()
})

test('shows an alert when self-grading fails and keeps the self-grade buttons', async () => {
  vi.mocked(api.next).mockResolvedValueOnce({
    id: 10, type: 'SHORT_ANSWER', prompt: 'Describe the handshake.', options: [], sourcePages: '3,4',
  })
  vi.mocked(api.answer).mockResolvedValueOnce({ id: 2, verdict: 'PENDING', score: null, feedback: null })
  vi.mocked(api.selfGrade).mockRejectedValueOnce(new Error('500 /api/study/attempts/2/self-grade'))
  render(<StudyPage />)
  await waitFor(() => expect(screen.getByText('Describe the handshake.')).toBeInTheDocument())
  await userEvent.type(screen.getByRole('textbox'), 'SYN then SYN-ACK')
  await userEvent.click(screen.getByRole('button', { name: /submit/i }))
  await waitFor(() => expect(screen.getByRole('button', { name: /I got it right/i })).toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: /I got it right/i }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('500 /api/study/attempts/2/self-grade'))
  expect(api.selfGrade).toHaveBeenCalledWith(2, true)
  expect(screen.getByRole('button', { name: /I got it right/i })).toBeEnabled()
  expect(screen.getByRole('button', { name: /I got it wrong/i })).toBeEnabled()
})

test('disables Next while a self-grade is in flight', async () => {
  vi.mocked(api.next).mockResolvedValueOnce({
    id: 10, type: 'SHORT_ANSWER', prompt: 'Describe the handshake.', options: [], sourcePages: '3,4',
  })
  vi.mocked(api.answer).mockResolvedValueOnce({ id: 2, verdict: 'PENDING', score: null, feedback: null })
  let resolveSelfGrade!: (a: Attempt) => void
  vi.mocked(api.selfGrade).mockReturnValueOnce(new Promise<Attempt>(r => { resolveSelfGrade = r }))
  render(<StudyPage />)
  await waitFor(() => expect(screen.getByText('Describe the handshake.')).toBeInTheDocument())
  await userEvent.type(screen.getByRole('textbox'), 'SYN then SYN-ACK')
  await userEvent.click(screen.getByRole('button', { name: /submit/i }))
  await waitFor(() => expect(screen.getByRole('button', { name: /I got it right/i })).toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: /I got it right/i }))
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  resolveSelfGrade({ id: 2, verdict: 'CORRECT', score: 1, feedback: null })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
  expect(api.next).toHaveBeenCalledTimes(1)
})
