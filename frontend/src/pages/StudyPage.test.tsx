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
