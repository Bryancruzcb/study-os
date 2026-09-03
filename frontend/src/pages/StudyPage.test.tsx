import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import StudyPage from './StudyPage'
import { api } from '../api'

vi.mock('../api', () => ({
  api: {
    courses: vi.fn().mockResolvedValue([{ id: 1, name: 'CS 158A', term: 'Fall 2026' }]),
    next: vi.fn().mockResolvedValue({
      id: 9, type: 'MC', prompt: 'Steps in the TCP handshake?',
      optionsJson: '["1","2","3","4"]', correctIndex: null, sourcePages: '3', status: 'ACTIVE',
    }),
    answer: vi.fn().mockResolvedValue({ id: 1, verdict: 'CORRECT', score: 1, feedback: null }),
  },
}))

test('shows question, submits MC answer, shows verdict', async () => {
  render(<StudyPage />)
  await waitFor(() => expect(screen.getByText('Steps in the TCP handshake?')).toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByText(/CORRECT/)).toBeInTheDocument())
  expect(api.answer).toHaveBeenCalledWith({ questionId: 9, answerIndex: 2 })
})

test('empty state when nothing due', async () => {
  vi.mocked(api.next).mockResolvedValueOnce(null)
  render(<StudyPage />)
  await waitFor(() => expect(screen.getByText(/Nothing due/)).toBeInTheDocument())
})
