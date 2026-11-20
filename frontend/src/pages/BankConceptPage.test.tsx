import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { api, type ConceptWithQuestions, type Question } from '../api'
import { renderBank } from '../test/render'

const course = { id: 1, name: 'CS 158A', term: 'Fall 2026', concepts: 1, questions: 2, dueToday: 1, archived: false }

function question(over: Partial<Question>): Question {
  return {
    id: 9, type: 'MC', prompt: 'Steps?', optionsJson: '["1","2","3","4"]', correctIndex: 2, sourcePages: '3',
    status: 'ACTIVE', labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null, ...over,
  }
}

function concept(questions: Question[]): ConceptWithQuestions[] {
  return [{ id: 5, name: 'TCP handshake', summary: 'SYN/SYN-ACK/ACK', sourcePages: '3,4', lecture: 'Lecture 3.pdf', questions }]
}

vi.mock('../api', () => ({
  api: {
    overview: vi.fn(),
    bank: vi.fn(),
    lectures: vi.fn(),
    upload: vi.fn(),
    deleteLecture: vi.fn(),
    retire: vi.fn(),
    restore: vi.fn(),
    label: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.overview).mockResolvedValue([course])
  vi.mocked(api.bank).mockResolvedValue(concept([question({})]))
  vi.mocked(api.lectures).mockResolvedValue([])
  vi.mocked(api.deleteLecture).mockResolvedValue(undefined)
  vi.mocked(api.retire).mockResolvedValue(undefined)
  vi.mocked(api.restore).mockResolvedValue(undefined)
  vi.mocked(api.label).mockResolvedValue(undefined)
})

const at = () => renderBank('/courses/1/bank/5')

test('renders the concept with its summary, pages, counts and question cards', async () => {
  at()
  expect(await screen.findByRole('heading', { level: 2, name: 'TCP handshake' })).toBeInTheDocument()
  expect(screen.getByText('SYN/SYN-ACK/ACK')).toBeInTheDocument()
  expect(screen.getByText('Lecture 3.pdf · slides 3, 4')).toBeInTheDocument()
  expect(screen.getByText('1 question')).toBeInTheDocument()
  expect(screen.getByText('Steps?')).toBeInTheDocument()
  expect(screen.getByText('Multiple choice')).toBeInTheDocument()
  expect(screen.getByText('slide 3')).toBeInTheDocument()
})

test('a multiple-choice card lists every option and marks the right one with a check and the words', async () => {
  at()
  const options = await screen.findByRole('list', { name: 'Options' })
  const rows = within(options).getAllByRole('listitem')
  expect(rows.map(r => r.querySelector('.qcard-option-text')!.textContent)).toEqual(['1', '2', '3', '4'])
  expect(rows[2]).toHaveClass('is-key')
  expect(rows[2]).toHaveTextContent('Right answer')
  expect(rows[2].querySelector('svg')).not.toBeNull()
  for (const i of [0, 1, 3]) {
    expect(rows[i]).not.toHaveClass('is-key')
    expect(rows[i]).not.toHaveTextContent('Right answer')
  }
  expect(screen.getAllByText('Right answer')).toHaveLength(1)
})

test('a short answer shows its model answer when the bank sends one', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([
    Object.assign(question({ type: 'SHORT_ANSWER', prompt: 'Why three?', optionsJson: null, correctIndex: null }),
      { modelAnswer: 'Each side must confirm the other side\'s sequence number.' }),
  ]))
  at()
  await screen.findByText('Why three?')
  expect(screen.getByText('Model answer')).toBeInTheDocument()
  expect(screen.getByText('Each side must confirm the other side\'s sequence number.')).toBeInTheDocument()
  expect(screen.queryByRole('list', { name: 'Options' })).not.toBeInTheDocument()
})

test('a short answer with no model answer shows only its prompt', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([
    Object.assign(question({ type: 'SHORT_ANSWER', prompt: 'Why three?', optionsJson: null, correctIndex: null }),
      { modelAnswer: null }),
  ]))
  at()
  await screen.findByText('Why three?')
  expect(screen.queryByText('Model answer')).not.toBeInTheDocument()
})

test('a multiple-choice question whose options do not parse shows no options rather than failing', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([question({ optionsJson: 'not json' })]))
  at()
  await screen.findByText('Steps?')
  expect(screen.queryByRole('list', { name: 'Options' })).not.toBeInTheDocument()
})

test('a concept and a question with no pages render no citation', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce([{
    id: 5, name: 'Sockets', summary: 'bind/listen/accept', sourcePages: null, lecture: null,
    questions: [question({ id: 11, type: 'SHORT_ANSWER', prompt: 'What does bind do?', optionsJson: null, correctIndex: null, sourcePages: null })],
  }])
  at()
  await screen.findByRole('heading', { level: 2, name: 'Sockets' })
  expect(screen.queryByText(/slide|Lecture/)).not.toBeInTheDocument()
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
  expect(screen.queryByRole('button', { name: 'Label' })).not.toBeInTheDocument()
  expect(screen.getByText('Steps?')).toHaveClass('qcard-prompt')
  expect(screen.getByText('Steps?').closest('li')).toHaveClass('qcard--retired')
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

// the labels sit closed behind one quiet button on each card
const openLabels = async () => userEvent.click(await screen.findByRole('button', { name: 'Label' }))

test('the labels stay closed behind a Label button until asked for', async () => {
  at()
  const label = await screen.findByRole('button', { name: 'Label' })
  expect(label).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByLabelText('Answerable')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Save labels' })).not.toBeInTheDocument()
  // an unlabelled question has no line to summarise
  expect(screen.queryByText(/Labeled/)).not.toBeInTheDocument()
  await userEvent.click(label)
  expect(label).toHaveAttribute('aria-expanded', 'true')
  const checks = screen.getByRole('group', { name: 'Labels for this question' })
  expect(within(checks).getByLabelText('Answerable')).toBeChecked()
  expect(within(checks).getByLabelText('Correct')).toBeChecked()
  expect(within(checks).getByLabelText('Unambiguous')).toBeChecked()
  expect(within(checks).getByRole('button', { name: 'Save labels' })).toBeInTheDocument()
})

test('labels a question with the toggles as set, then closes and sums them up in one line', async () => {
  at()
  await openLabels()
  await userEvent.click(screen.getByLabelText('Unambiguous'))
  await userEvent.click(screen.getByRole('button', { name: 'Save labels' }))
  await waitFor(() =>
    expect(api.label).toHaveBeenCalledWith(9, { answerable: true, correctAnswer: true, unambiguous: false }))
  expect(await screen.findByText('Labeled: answerable · correct · ambiguous')).toBeInTheDocument()
  expect(screen.queryByLabelText('Answerable')).not.toBeInTheDocument()
  // opening again shows what was saved, not the defaults
  await openLabels()
  expect(screen.getByLabelText('Unambiguous')).not.toBeChecked()
})

test('closing the labels without saving drops the change', async () => {
  at()
  await openLabels()
  await userEvent.click(screen.getByLabelText('Correct'))
  await openLabels()
  expect(screen.queryByLabelText('Correct')).not.toBeInTheDocument()
  await openLabels()
  expect(screen.getByLabelText('Correct')).toBeChecked()
  expect(api.label).not.toHaveBeenCalled()
})

test('shows a failed label in the alert and leaves the question unlabelled', async () => {
  vi.mocked(api.label).mockRejectedValueOnce(new Error('500 /api/questions/9/label'))
  at()
  await openLabels()
  await userEvent.click(screen.getByRole('button', { name: 'Save labels' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/questions/9/label')
  expect(screen.getByRole('button', { name: 'Save labels' })).toBeInTheDocument()
  expect(screen.queryByText(/Labeled/)).not.toBeInTheDocument()
})

test('seeds the toggles from the labels the question arrives with', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([
    question({ labelAnswerable: true, labelCorrectAnswer: false, labelUnambiguous: true }),
  ]))
  at()
  expect(await screen.findByText('Labeled: answerable · not correct · unambiguous')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Save labels' })).not.toBeInTheDocument()
  await openLabels()
  expect(screen.getByLabelText('Answerable')).toBeChecked()
  expect(screen.getByLabelText('Correct')).not.toBeChecked()
  expect(screen.getByLabelText('Unambiguous')).toBeChecked()
})

test('re-saving a labelled question posts the stored labels with the one change, not the defaults', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([
    question({ labelAnswerable: true, labelCorrectAnswer: false, labelUnambiguous: true }),
  ]))
  at()
  await openLabels()
  await userEvent.click(screen.getByLabelText('Unambiguous'))
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

test('confirming leaves the caret on the struck card, one Tab from Restore', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([question({})]))
  vi.mocked(api.bank).mockResolvedValueOnce(concept([question({ status: 'RETIRED' })]))
  at()
  await userEvent.click(await screen.findByRole('button', { name: 'Retire' }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm retire' }))
  const restore = await screen.findByRole('button', { name: 'Restore' })
  // not on Restore itself: a held Enter on Confirm would run on into it and undo the retire
  await waitFor(() => expect(screen.getByText('Not labeled')).toHaveFocus())
  await userEvent.tab()
  expect(restore).toHaveFocus()
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

test('saving labels keeps the caret on the card: the line takes it, one Tab from Retire', async () => {
  at()
  await openLabels()
  await userEvent.click(screen.getByRole('button', { name: 'Save labels' }))
  const mark = await screen.findByText('Labeled: answerable · correct · unambiguous')
  await waitFor(() => expect(mark).toHaveFocus())
  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'Retire' })).toHaveFocus()
})

test('a card that arrives labelled leaves the caret alone', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(
    concept([question({ labelAnswerable: true, labelCorrectAnswer: true, labelUnambiguous: true })]))
  at()
  await screen.findByText(/^Labeled:/)
  expect(document.body).toHaveFocus()
})

test('a retired card that was labelled says so in the same line', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([
    question({ status: 'RETIRED', labelAnswerable: false, labelCorrectAnswer: true, labelUnambiguous: true }),
  ]))
  at()
  expect(await screen.findByText('Labeled: not answerable · correct · unambiguous')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Label' })).not.toBeInTheDocument()
})

test('a link to one question brings its card into view and marks it', async () => {
  // jsdom has no layout and no scrollIntoView, so the call, and what it was called on, is the assertion
  const scroll = vi.fn()
  const proto = HTMLElement.prototype as unknown as { scrollIntoView?: (arg?: unknown) => void }
  const before = proto.scrollIntoView
  proto.scrollIntoView = scroll
  try {
    vi.mocked(api.bank).mockResolvedValueOnce(concept([question({}), question({ id: 12, prompt: 'Why three?' })]))
    renderBank('/courses/1/bank/5#question-12')
    const card = (await screen.findByText('Why three?')).closest('li')!
    expect(card).toHaveClass('is-target')
    expect(screen.getByText('Steps?').closest('li')).not.toHaveClass('is-target')
    await waitFor(() => expect(scroll.mock.contexts).toContain(card))
  } finally {
    proto.scrollIntoView = before
  }
})
