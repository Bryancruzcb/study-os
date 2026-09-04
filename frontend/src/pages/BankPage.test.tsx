import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { api, type Course } from '../api'
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
    restore: vi.fn(),
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

test('one click on retire arms the row instead of retiring it', async () => {
  const before = vi.mocked(api.retire).mock.calls.length
  render(<BankPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'retire' }))
  expect(vi.mocked(api.retire).mock.calls.length).toBe(before)
  await userEvent.click(screen.getByRole('button', { name: 'confirm' }))
  await waitFor(() => expect(api.retire).toHaveBeenLastCalledWith(9))
})

test('cancel disarms the row and retires nothing', async () => {
  const before = vi.mocked(api.retire).mock.calls.length
  render(<BankPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'retire' }))
  await userEvent.click(screen.getByRole('button', { name: 'cancel' }))
  expect(screen.getByRole('button', { name: 'retire' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'confirm' })).not.toBeInTheDocument()
  expect(vi.mocked(api.retire).mock.calls.length).toBe(before)
})

test('arming from the keyboard leaves focus on cancel, so a repeated Enter disarms', async () => {
  const before = vi.mocked(api.retire).mock.calls.length
  render(<BankPage />)
  const retire = await screen.findByRole('button', { name: 'retire' })
  retire.focus()
  await userEvent.keyboard('{Enter}')
  expect(screen.getByRole('button', { name: 'cancel' })).toHaveFocus()
  // the repeat of a held Enter goes wherever the first press left focus
  await userEvent.keyboard('{Enter}')
  expect(vi.mocked(api.retire).mock.calls.length).toBe(before)
  expect(screen.getByRole('button', { name: 'retire' })).toBeInTheDocument()
})

test('arming a second row disarms the first', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce([
    {
      id: 5, name: 'TCP handshake', summary: 'SYN/SYN-ACK/ACK', sourcePages: '3,4',
      questions: [
        { id: 9, type: 'MC', prompt: 'Steps?', optionsJson: '["1","2","3","4"]', correctIndex: 2, sourcePages: '3', status: 'ACTIVE', labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null },
        { id: 10, type: 'SHORT_ANSWER', prompt: 'Why three?', optionsJson: null, correctIndex: null, sourcePages: '4', status: 'ACTIVE', labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null },
      ],
    },
  ])
  render(<BankPage />)
  const rows = await screen.findAllByRole('button', { name: 'retire' })
  await userEvent.click(rows[0])
  // the only retire left on screen belongs to the row that is still disarmed
  await userEvent.click(screen.getByRole('button', { name: 'retire' }))
  expect(screen.getAllByRole('button', { name: 'confirm' })).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: 'confirm' }))
  await waitFor(() => expect(api.retire).toHaveBeenLastCalledWith(10))
})

test('a retired question offers restore, which reloads the bank', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce([
    {
      id: 5, name: 'TCP handshake', summary: 'SYN/SYN-ACK/ACK', sourcePages: '3,4',
      questions: [
        { id: 9, type: 'MC', prompt: 'Steps?', optionsJson: '["1","2","3","4"]', correctIndex: 2, sourcePages: '3', status: 'RETIRED', labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null },
      ],
    },
  ])
  render(<BankPage />)
  const restore = await screen.findByRole('button', { name: 'restore' })
  expect(screen.queryByRole('button', { name: 'retire' })).not.toBeInTheDocument()
  const bankCalls = vi.mocked(api.bank).mock.calls.length
  await userEvent.click(restore)
  await waitFor(() => expect(api.restore).toHaveBeenLastCalledWith(9))
  await waitFor(() => expect(vi.mocked(api.bank).mock.calls.length).toBe(bankCalls + 1))
})

test('restore clears the alert an earlier failure left on screen', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce([
    {
      id: 5, name: 'TCP handshake', summary: 'SYN/SYN-ACK/ACK', sourcePages: '3,4',
      questions: [
        { id: 9, type: 'MC', prompt: 'Steps?', optionsJson: '["1","2","3","4"]', correctIndex: 2, sourcePages: '3', status: 'ACTIVE', labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null },
        { id: 12, type: 'SHORT_ANSWER', prompt: 'Why three?', optionsJson: null, correctIndex: null, sourcePages: '4', status: 'RETIRED', labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null },
      ],
    },
  ])
  vi.mocked(api.retire).mockRejectedValueOnce(new Error('500 /api/questions/9/retire'))
  let land!: () => void
  vi.mocked(api.restore).mockReturnValueOnce(new Promise(resolve => { land = () => resolve(undefined) }))
  render(<BankPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'retire' }))
  await userEvent.click(screen.getByRole('button', { name: 'confirm' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/questions/9/retire')
  await userEvent.click(screen.getByRole('button', { name: 'restore' }))
  // the stale error goes at the click, not once the restore lands
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  land()
  await waitFor(() => expect(api.restore).toHaveBeenLastCalledWith(12))
})

test('shows a failed retire in the alert', async () => {
  vi.mocked(api.retire).mockRejectedValueOnce(new Error('500 /api/questions/9/retire'))
  render(<BankPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'retire' }))
  await userEvent.click(screen.getByRole('button', { name: 'confirm' }))
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

test('a concept and a question with no pages render no citation', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce([
    {
      id: 6, name: 'Sockets', summary: 'bind/listen/accept', sourcePages: null,
      questions: [
        { id: 11, type: 'SHORT_ANSWER', prompt: 'What does bind do?', optionsJson: null, correctIndex: null, sourcePages: null, status: 'ACTIVE', labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null },
      ],
    },
  ])
  render(<BankPage />)
  await screen.findByText('Sockets')
  expect(screen.queryByText(/pp\./)).not.toBeInTheDocument()
})

test('the new course form opens focused and prefilled with the selected term', async () => {
  render(<BankPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'New course' }))
  expect(screen.getByLabelText('Name')).toHaveFocus()
  expect(screen.getByLabelText('Term')).toHaveValue('Fall 2026')
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
})

test('Create stays disabled until both fields hold more than whitespace', async () => {
  render(<BankPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'New course' }))
  await userEvent.clear(screen.getByLabelText('Term'))
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Name'), '   ')
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Term'), 'Spring 2027')
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Name'), 'CS 149')
  expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
})

test('creating a course posts the trimmed name and the typed term, then selects it', async () => {
  vi.mocked(api.createCourse).mockResolvedValueOnce({ id: 2, name: 'CS 149', term: 'Spring 2027' })
  render(<BankPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'New course' }))
  await userEvent.type(screen.getByLabelText('Name'), '  CS 149  ')
  await userEvent.clear(screen.getByLabelText('Term'))
  await userEvent.type(screen.getByLabelText('Term'), 'Spring 2027')
  await userEvent.click(screen.getByRole('button', { name: 'Create' }))
  await waitFor(() => expect(api.createCourse).toHaveBeenCalledWith('CS 149', 'Spring 2027'))
  await waitFor(() => expect(screen.queryByLabelText('Name')).not.toBeInTheDocument())
  expect(screen.getByRole('combobox')).toHaveValue('2')
})

test('Create is disabled for as long as the create is in flight', async () => {
  let land!: (c: Course) => void
  vi.mocked(api.createCourse).mockReturnValueOnce(new Promise<Course>(resolve => { land = resolve }))
  render(<BankPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'New course' }))
  await userEvent.type(screen.getByLabelText('Name'), 'CS 149')
  await userEvent.click(screen.getByRole('button', { name: 'Create' }))
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  land({ id: 3, name: 'CS 149', term: 'Fall 2026' })
  await waitFor(() => expect(screen.queryByLabelText('Name')).not.toBeInTheDocument())
})

test('a failed create shows the alert and leaves the form open with what was typed', async () => {
  vi.mocked(api.createCourse).mockRejectedValueOnce(new Error('500 /api/courses'))
  render(<BankPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'New course' }))
  await userEvent.type(screen.getByLabelText('Name'), 'CS 149')
  await userEvent.click(screen.getByRole('button', { name: 'Create' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/courses')
  expect(screen.getByLabelText('Name')).toHaveValue('CS 149')
  expect(screen.getByLabelText('Term')).toHaveValue('Fall 2026')
})

const activeRow = (status: 'ACTIVE' | 'RETIRED') => [
  {
    id: 5, name: 'TCP handshake', summary: 'SYN/SYN-ACK/ACK', sourcePages: '3,4',
    questions: [
      { id: 9, type: 'MC' as const, prompt: 'Steps?', optionsJson: '["1","2","3","4"]', correctIndex: 2, sourcePages: '3', status, labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null },
    ],
  },
]

test('cancelling puts the caret back on the row it was working', async () => {
  render(<BankPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'retire' }))
  await userEvent.click(screen.getByRole('button', { name: 'cancel' }))
  expect(screen.getByRole('button', { name: 'retire' })).toHaveFocus()
})

test('confirming leaves the caret on the restore that takes the row over', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(activeRow('ACTIVE'))
  vi.mocked(api.bank).mockResolvedValueOnce(activeRow('RETIRED'))
  vi.mocked(api.retire).mockResolvedValueOnce(undefined)
  render(<BankPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'retire' }))
  await userEvent.click(screen.getByRole('button', { name: 'confirm' }))
  const restore = await screen.findByRole('button', { name: 'restore' })
  await waitFor(() => expect(restore).toHaveFocus())
})

test('closing the course form hands the caret back to New course', async () => {
  render(<BankPage />)
  const open = await screen.findByRole('button', { name: 'New course' })
  await userEvent.click(open)
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(open).toHaveFocus()
})
