import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { api, type ConceptWithQuestions, type Question } from '../api'
import { renderBank } from '../test/render'

const course = { id: 1, name: 'CS 158A', term: 'Fall 2026', concepts: 1, questions: 2, dueToday: 1 }

function question(over: Partial<Question>): Question {
  return {
    id: 9, type: 'MC', prompt: 'Steps?', optionsJson: '["1","2","3","4"]', correctIndex: 2, sourcePages: '3',
    status: 'ACTIVE', labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null, ...over,
  }
}

function concept(questions: Question[]): ConceptWithQuestions[] {
  return [{ id: 5, name: 'TCP handshake', summary: 'SYN/SYN-ACK/ACK', sourcePages: '3,4', questions }]
}

vi.mock('../api', () => ({
  api: {
    overview: vi.fn(),
    bank: vi.fn(),
    upload: vi.fn(),
    retire: vi.fn(),
    restore: vi.fn(),
    label: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.overview).mockResolvedValue([course])
  vi.mocked(api.bank).mockResolvedValue(concept([question({})]))
  vi.mocked(api.retire).mockResolvedValue(undefined)
  vi.mocked(api.restore).mockResolvedValue(undefined)
  vi.mocked(api.label).mockResolvedValue(undefined)
})

const at = () => renderBank('/courses/1/bank/5')

test('renders the concept with its summary, pages, counts and question cards', async () => {
  at()
  expect(await screen.findByRole('heading', { level: 2, name: 'TCP handshake' })).toBeInTheDocument()
  expect(screen.getByText('SYN/SYN-ACK/ACK')).toBeInTheDocument()
  expect(screen.getByText('pp. 3,4')).toBeInTheDocument()
  expect(screen.getByText('1 question')).toBeInTheDocument()
  expect(screen.getByText('Steps?')).toBeInTheDocument()
  expect(screen.getByText('Multiple choice')).toBeInTheDocument()
  expect(screen.getByText('pp. 3')).toBeInTheDocument()
})

test('a concept and a question with no pages render no citation', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce([{
    id: 5, name: 'Sockets', summary: 'bind/listen/accept', sourcePages: null,
    questions: [question({ id: 11, type: 'SHORT_ANSWER', prompt: 'What does bind do?', optionsJson: null, correctIndex: null, sourcePages: null })],
  }])
  at()
  await screen.findByRole('heading', { level: 2, name: 'Sockets' })
  expect(screen.queryByText(/pp\./)).not.toBeInTheDocument()
})

test('an unknown concept is a not-found state beside the list', async () => {
  renderBank('/courses/1/bank/99')
  expect(await screen.findByRole('alert')).toHaveTextContent('No concept has id 99.')
  expect(screen.getByRole('link', { name: /TCP handshake/ })).toBeInTheDocument()
})

test('one click on Retire arms the card instead of retiring it', async () => {
  at()
  await userEvent.click(await screen.findByRole('button', { name: 'Retire' }))
  expect(api.retire).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Confirm retire' }))
  await waitFor(() => expect(api.retire).toHaveBeenLastCalledWith(9))
})

test('Cancel disarms the card and retires nothing', async () => {
  at()
  await userEvent.click(await screen.findByRole('button', { name: 'Retire' }))
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'Retire' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Confirm retire' })).not.toBeInTheDocument()
  expect(api.retire).not.toHaveBeenCalled()
})

test('arming from the keyboard leaves focus on Cancel, so a repeated Enter disarms', async () => {
  at()
  const retire = await screen.findByRole('button', { name: 'Retire' })
  retire.focus()
  await userEvent.keyboard('{Enter}')
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  // the repeat of a held Enter goes wherever the first press left focus
  await userEvent.keyboard('{Enter}')
  expect(api.retire).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Retire' })).toBeInTheDocument()
})

test('arming a second card disarms the first', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([
    question({}),
    question({ id: 10, type: 'SHORT_ANSWER', prompt: 'Why three?', optionsJson: null, correctIndex: null, sourcePages: '4' }),
  ]))
  at()
  const retires = await screen.findAllByRole('button', { name: 'Retire' })
  await userEvent.click(retires[0])
  // the only Retire left on screen belongs to the card that is still disarmed
  await userEvent.click(screen.getByRole('button', { name: 'Retire' }))
  expect(screen.getAllByRole('button', { name: 'Confirm retire' })).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: 'Confirm retire' }))
  await waitFor(() => expect(api.retire).toHaveBeenLastCalledWith(10))
})

test('a retired question is struck, marked, and offers Restore, which reloads the bank', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([question({ status: 'RETIRED' })]))
  at()
  const restore = await screen.findByRole('button', { name: 'Restore' })
  expect(screen.getByText('Retired')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Retire' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Answerable')).not.toBeInTheDocument()
  const bankCalls = vi.mocked(api.bank).mock.calls.length
  await userEvent.click(restore)
  await waitFor(() => expect(api.restore).toHaveBeenLastCalledWith(9))
  await waitFor(() => expect(vi.mocked(api.bank).mock.calls.length).toBe(bankCalls + 1))
})

test('Restore clears the alert an earlier failure left on screen', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([
    question({}),
    question({ id: 12, type: 'SHORT_ANSWER', prompt: 'Why three?', optionsJson: null, correctIndex: null, sourcePages: '4', status: 'RETIRED' }),
  ]))
  vi.mocked(api.retire).mockRejectedValueOnce(new Error('500 /api/questions/9/retire'))
  let land!: () => void
  vi.mocked(api.restore).mockReturnValueOnce(new Promise(resolve => { land = () => resolve(undefined) }))
  at()
  await userEvent.click(await screen.findByRole('button', { name: 'Retire' }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm retire' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/questions/9/retire')
  await userEvent.click(screen.getByRole('button', { name: 'Restore' }))
  // the stale error goes at the click, not once the restore lands
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  land()
  await waitFor(() => expect(api.restore).toHaveBeenLastCalledWith(12))
})

test('shows a failed retire in the alert', async () => {
  vi.mocked(api.retire).mockRejectedValueOnce(new Error('500 /api/questions/9/retire'))
  at()
  await userEvent.click(await screen.findByRole('button', { name: 'Retire' }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm retire' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/questions/9/retire')
})

test('labels a question with the toggles as set', async () => {
  at()
  await userEvent.click(await screen.findByLabelText('Unambiguous'))
  await userEvent.click(screen.getByRole('button', { name: 'Save labels' }))
  await waitFor(() =>
    expect(api.label).toHaveBeenCalledWith(9, { answerable: true, correctAnswer: true, unambiguous: false }))
  expect(await screen.findByText('labeled')).toBeInTheDocument()
  // changing a toggle after the save means the stored labels no longer match what is shown
  await userEvent.click(screen.getByLabelText('Correct'))
  expect(screen.getByRole('button', { name: 'Save labels' })).toBeInTheDocument()
})

test('shows a failed label in the alert and leaves the question unlabelled', async () => {
  vi.mocked(api.label).mockRejectedValueOnce(new Error('500 /api/questions/9/label'))
  at()
  await userEvent.click(await screen.findByRole('button', { name: 'Save labels' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/questions/9/label')
  expect(screen.getByRole('button', { name: 'Save labels' })).toBeInTheDocument()
})

test('seeds the toggles from the labels the question arrives with', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([
    question({ labelAnswerable: true, labelCorrectAnswer: false, labelUnambiguous: true }),
  ]))
  at()
  expect(await screen.findByLabelText('Answerable')).toBeChecked()
  expect(screen.getByLabelText('Correct')).not.toBeChecked()
  expect(screen.getByLabelText('Unambiguous')).toBeChecked()
  expect(screen.getByText('labeled')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Save labels' })).not.toBeInTheDocument()
})

test('re-saving a labelled question posts the stored labels with the one change, not the defaults', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([
    question({ labelAnswerable: true, labelCorrectAnswer: false, labelUnambiguous: true }),
  ]))
  at()
  await userEvent.click(await screen.findByLabelText('Unambiguous'))
  await userEvent.click(screen.getByRole('button', { name: 'Save labels' }))
  await waitFor(() =>
    expect(api.label).toHaveBeenCalledWith(9, { answerable: true, correctAnswer: false, unambiguous: false }))
})

test('cancelling puts the caret back on the card it was working', async () => {
  at()
  await userEvent.click(await screen.findByRole('button', { name: 'Retire' }))
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'Retire' })).toHaveFocus()
})

test('confirming leaves the caret on the Restore that takes the card over', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([question({})]))
  vi.mocked(api.bank).mockResolvedValueOnce(concept([question({ status: 'RETIRED' })]))
  at()
  await userEvent.click(await screen.findByRole('button', { name: 'Retire' }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm retire' }))
  const restore = await screen.findByRole('button', { name: 'Restore' })
  await waitFor(() => expect(restore).toHaveFocus())
})

test('confirming a retire refetches the overview, so the head count follows', async () => {
  at()
  await userEvent.click(await screen.findByRole('button', { name: 'Retire' }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm retire' }))
  await waitFor(() => expect(api.retire).toHaveBeenLastCalledWith(9))
  await waitFor(() => expect(api.overview).toHaveBeenCalledTimes(2))
})

test('Restore refetches the overview too', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([question({ status: 'RETIRED' })]))
  at()
  await userEvent.click(await screen.findByRole('button', { name: 'Restore' }))
  await waitFor(() => expect(api.restore).toHaveBeenLastCalledWith(9))
  await waitFor(() => expect(api.overview).toHaveBeenCalledTimes(2))
})

test('saving labels keeps the caret on the card: the mark takes it, one Tab from Retire', async () => {
  at()
  await userEvent.click(await screen.findByRole('button', { name: 'Save labels' }))
  const mark = await screen.findByText('labeled')
  await waitFor(() => expect(mark).toHaveFocus())
  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'Retire' })).toHaveFocus()
})

test('a card that arrives labelled leaves the caret alone', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(
    concept([question({ labelAnswerable: true, labelCorrectAnswer: true, labelUnambiguous: true })]))
  at()
  await screen.findByText('labeled')
  expect(document.body).toHaveFocus()
})
