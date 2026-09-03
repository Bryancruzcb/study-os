import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { api } from '../api'
import BankPage from './BankPage'

vi.mock('../api', () => ({
  api: {
    courses: vi.fn().mockResolvedValue([{ id: 1, name: 'CS 158A', term: 'Fall 2026' }]),
    bank: vi.fn().mockResolvedValue([
      {
        id: 5, name: 'TCP handshake', summary: 'SYN/SYN-ACK/ACK', sourcePages: '3,4',
        questions: [
          { id: 9, type: 'MC', prompt: 'Steps?', optionsJson: '["1","2","3","4"]', correctIndex: 2, sourcePages: '3', status: 'ACTIVE', labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null },
        ],
      },
    ]),
    upload: vi.fn(),
    retire: vi.fn(),
    createCourse: vi.fn(),
    label: vi.fn(),
  },
}))

test('renders concepts with questions and page citations', async () => {
  render(<BankPage />)
  await waitFor(() => expect(screen.getByText('TCP handshake')).toBeInTheDocument())
  expect(screen.getByText(/pp\. 3,4/)).toBeInTheDocument()
  expect(screen.getByText('Steps?')).toBeInTheDocument()
})

test('shows a failed retire in the alert', async () => {
  vi.mocked(api.retire).mockRejectedValueOnce(new Error('500 /api/questions/9/retire'))
  render(<BankPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'retire' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/questions/9/retire')
})

test('shows a failed ingest in the alert and refreshes the bank', async () => {
  vi.mocked(api.upload).mockResolvedValueOnce({ id: 2, filename: 'week1.pdf', status: 'FAILED', errorMessage: 'boom' })
  const { container } = render(<BankPage />)
  await screen.findByText('TCP handshake')
  const bankCalls = vi.mocked(api.bank).mock.calls.length
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  await userEvent.upload(input, new File(['%PDF-1.4'], 'week1.pdf', { type: 'application/pdf' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  await waitFor(() => expect(vi.mocked(api.bank).mock.calls.length).toBe(bankCalls + 1))
})

test('labels a question with the boxes as checked', async () => {
  render(<BankPage />)
  await userEvent.click(await screen.findByLabelText('unambiguous'))
  await userEvent.click(screen.getByRole('button', { name: 'label' }))
  await waitFor(() =>
    expect(api.label).toHaveBeenCalledWith(9, { answerable: true, correctAnswer: true, unambiguous: false }))
  expect(await screen.findByRole('button', { name: /labeled/ })).toBeInTheDocument()
  // changing a box after the save means the stored labels no longer match what is shown
  await userEvent.click(screen.getByLabelText('correct'))
  expect(screen.getByRole('button', { name: 'label' })).toBeInTheDocument()
})

test('shows a failed label in the alert and leaves the question unlabelled', async () => {
  vi.mocked(api.label).mockRejectedValueOnce(new Error('500 /api/questions/9/label'))
  render(<BankPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'label' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/questions/9/label')
  expect(screen.getByRole('button', { name: 'label' })).toBeInTheDocument()
})

test('seeds the boxes from the labels the question arrives with', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce([
    {
      id: 5, name: 'TCP handshake', summary: 'SYN/SYN-ACK/ACK', sourcePages: '3,4',
      questions: [
        { id: 9, type: 'MC', prompt: 'Steps?', optionsJson: '["1","2","3","4"]', correctIndex: 2, sourcePages: '3', status: 'ACTIVE', labelAnswerable: true, labelCorrectAnswer: false, labelUnambiguous: true },
      ],
    },
  ])
  render(<BankPage />)
  expect(await screen.findByLabelText('answerable')).toBeChecked()
  expect(screen.getByLabelText('correct')).not.toBeChecked()
  expect(screen.getByLabelText('unambiguous')).toBeChecked()
  expect(screen.getByRole('button', { name: /labeled/ })).toBeInTheDocument()
})

test('re-saving a labelled question posts the saved labels, not the defaults', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce([
    {
      id: 5, name: 'TCP handshake', summary: 'SYN/SYN-ACK/ACK', sourcePages: '3,4',
      questions: [
        { id: 9, type: 'MC', prompt: 'Steps?', optionsJson: '["1","2","3","4"]', correctIndex: 2, sourcePages: '3', status: 'ACTIVE', labelAnswerable: true, labelCorrectAnswer: false, labelUnambiguous: true },
      ],
    },
  ])
  render(<BankPage />)
  await userEvent.click(await screen.findByRole('button', { name: /labeled/ }))
  await waitFor(() =>
    expect(api.label).toHaveBeenCalledWith(9, { answerable: true, correctAnswer: false, unambiguous: true }))
})
