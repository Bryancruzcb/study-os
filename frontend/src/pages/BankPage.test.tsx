import { screen, waitFor, within } from '@testing-library/react'
import { SERVER_PROBLEM } from '../errors'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { vi } from 'vitest'
import { api } from '../api'
import { renderBank, renderBankInBrowser } from '../test/render'

const course = { id: 1, name: 'CS 158A', term: 'Fall 2026', concepts: 2, questions: 3, dueToday: 2, archived: false }

const bank = [
  {
    id: 5, name: 'TCP handshake', summary: 'SYN/SYN-ACK/ACK', sourcePages: '3,4', lecture: 'Lecture 3.pdf',
    questions: [
      { id: 9, type: 'MC' as const, prompt: 'Steps?', optionsJson: '["1","2","3","4"]', correctIndex: 2, sourcePages: '3', status: 'ACTIVE' as const, labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null },
      { id: 10, type: 'SHORT_ANSWER' as const, prompt: 'Why three?', optionsJson: null, correctIndex: null, sourcePages: '4', status: 'RETIRED' as const, labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null },
    ],
  },
  {
    id: 6, name: 'Sockets', summary: 'bind/listen/accept', sourcePages: null, lecture: null,
    questions: [
      { id: 11, type: 'SHORT_ANSWER' as const, prompt: 'What does bind do?', optionsJson: null, correctIndex: null, sourcePages: null, status: 'ACTIVE' as const, labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null },
    ],
  },
]

vi.mock('../api', () => ({
  api: {
    overview: vi.fn(),
    bank: vi.fn(),
    lectures: vi.fn(),
    upload: vi.fn(),
    material: vi.fn(),
    deleteLecture: vi.fn(),
    generateMore: vi.fn(),
    retire: vi.fn(),
    restore: vi.fn(),
    label: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.overview).mockResolvedValue([course])
  vi.mocked(api.bank).mockResolvedValue(bank)
  vi.mocked(api.lectures).mockResolvedValue([
    { id: 11, filename: 'Lecture 3.pdf', lectureTitle: 'Reliable transport', concepts: 1, topics: ['TCP handshake'] },
  ])
  vi.mocked(api.deleteLecture).mockResolvedValue(undefined)
})

test('lists every concept with its active count, linking to it', async () => {
  renderBank('/courses/1/bank/6')
  const row = await screen.findByRole('link', { name: /TCP handshake/ })
  expect(row).toHaveAttribute('href', '/courses/1/bank/5')
  expect(row.querySelector('.count')).toHaveTextContent('1')
  expect(screen.getByRole('link', { name: /Sockets/ })).toHaveAttribute('href', '/courses/1/bank/6')
  expect(screen.getByText('2 concepts')).toBeInTheDocument()
})

test('the bank on its own opens the first concept, and the list marks it', async () => {
  renderBank('/courses/1/bank')
  expect(await screen.findByRole('heading', { level: 2, name: 'TCP handshake' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /TCP handshake/ })).toHaveClass('is-current')
  expect(screen.getByRole('link', { name: /Sockets/ })).not.toHaveClass('is-current')
})

test('picking a concept in the list opens it on the right', async () => {
  renderBank('/courses/1/bank')
  await userEvent.click(await screen.findByRole('link', { name: /Sockets/ }))
  expect(await screen.findByRole('heading', { level: 2, name: 'Sockets' })).toBeInTheDocument()
  expect(screen.getByText('What does bind do?')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Sockets/ })).toHaveClass('is-current')
})

test('an empty bank says what to do next', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce([])
  renderBank('/courses/1/bank')
  expect(await screen.findByText(/No concepts yet/)).toBeInTheDocument()
  expect(screen.getByText('0 concepts')).toBeInTheDocument()
})

test('a failed bank load shows the alert', async () => {
  vi.mocked(api.bank).mockRejectedValueOnce(new Error(SERVER_PROBLEM))
  renderBank('/courses/1/bank')
  expect(await screen.findByRole('alert')).toHaveTextContent(SERVER_PROBLEM)
})

test('the upload control sits in the course head and refreshes the bank and the counts', async () => {
  vi.mocked(api.upload).mockResolvedValueOnce({ id: 2, filename: 'week1.pdf', status: 'INGESTED', errorMessage: null })
  const { container } = renderBank('/courses/1/bank')
  await screen.findByRole('link', { name: /TCP handshake/ })
  const bankCalls = vi.mocked(api.bank).mock.calls.length
  const overviewCalls = vi.mocked(api.overview).mock.calls.length
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  expect(input.closest('label')).toHaveTextContent('Add a lecture')
  expect(input.closest('.course-head-slot')).not.toBeNull()
  await userEvent.upload(input, new File(['%PDF-1.4'], 'week1.pdf', { type: 'application/pdf' }))
  await waitFor(() => expect(api.upload).toHaveBeenCalledWith(1, expect.any(File)))
  await waitFor(() => expect(vi.mocked(api.bank).mock.calls.length).toBe(bankCalls + 1))
  await waitFor(() => expect(vi.mocked(api.overview).mock.calls.length).toBe(overviewCalls + 1))
})

test('shows a failed ingest in the alert and refreshes the bank', async () => {
  vi.mocked(api.upload).mockResolvedValueOnce({ id: 2, filename: 'week1.pdf', status: 'FAILED', errorMessage: 'boom' })
  const { container } = renderBank('/courses/1/bank')
  await screen.findByRole('link', { name: /TCP handshake/ })
  const bankCalls = vi.mocked(api.bank).mock.calls.length
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  await userEvent.upload(input, new File(['%PDF-1.4'], 'week1.pdf', { type: 'application/pdf' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  await waitFor(() => expect(vi.mocked(api.bank).mock.calls.length).toBe(bankCalls + 1))
})

test('the list starts with a skip link that lands focus on the open concept', async () => {
  const { container } = renderBank('/courses/1/bank/5')
  const heading = await screen.findByRole('heading', { level: 2, name: 'TCP handshake' })
  const skip = within(container.querySelector<HTMLElement>('.clist')!).getAllByRole('link')[0]
  expect(skip).toHaveTextContent('Skip to the open concept')
  expect(skip).toHaveAttribute('href', '#concept')
  // first in the column, ahead of the head's buttons and the rows
  const rows = screen.getByRole('navigation', { name: 'Concepts' })
  expect(skip.compareDocumentPosition(rows) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  await userEvent.click(skip)
  const detail = document.getElementById('concept')!
  expect(detail).toHaveFocus()
  expect(detail).toContainElement(heading)
})

test('while the ingest runs the control says so and takes no second file', async () => {
  type Upload = Awaited<ReturnType<typeof api.upload>>
  let land!: (m: Upload) => void
  vi.mocked(api.upload).mockReturnValueOnce(new Promise<Upload>(resolve => { land = resolve }))
  const { container } = renderBank('/courses/1/bank')
  await screen.findByRole('link', { name: /TCP handshake/ })
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  await userEvent.upload(input, new File(['%PDF-1.4'], 'week1.pdf', { type: 'application/pdf' }))
  expect(input.closest('label')).toHaveTextContent('Uploading…')
  expect(input).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Uploading…')
  land({ id: 2, filename: 'week1.pdf', status: 'INGESTED', errorMessage: null })
  await waitFor(() => expect(input.closest('label')).toHaveTextContent('Add a lecture'))
  expect(input).toBeEnabled()
  expect(screen.getByRole('status')).toHaveTextContent('Add a lecture')
})

test('a deep link scrolls the open concept into view in the list', async () => {
  const scroll = vi.fn()
  const proto = HTMLElement.prototype as unknown as { scrollIntoView?: (arg?: unknown) => void }
  const before = proto.scrollIntoView
  proto.scrollIntoView = scroll
  try {
    renderBank('/courses/1/bank/6')
    await screen.findByRole('heading', { level: 2, name: 'Sockets' })
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: 'nearest' }))
    expect(scroll.mock.contexts.at(-1)).toBe(screen.getByRole('link', { name: /Sockets/ }))
  } finally {
    proto.scrollIntoView = before
  }
})

test('an ingest in flight survives leaving the bank tab, and the list follows when it lands', async () => {
  type Upload = Awaited<ReturnType<typeof api.upload>>
  let land!: (m: Upload) => void
  vi.mocked(api.upload).mockReturnValueOnce(new Promise<Upload>(resolve => { land = resolve }))
  const { container } = renderBank('/courses/1/bank/5', <Route path="study" element={<p>Study stub</p>} />)
  await screen.findByRole('link', { name: /TCP handshake/ })
  const overviewCalls = vi.mocked(api.overview).mock.calls.length
  const file = () => container.querySelector<HTMLInputElement>('input[type="file"]')!
  await userEvent.upload(file(), new File(['%PDF-1.4'], 'week1.pdf', { type: 'application/pdf' }))
  expect(file().closest('label')).toHaveTextContent('Uploading…')
  await userEvent.click(screen.getByRole('link', { name: 'Study' }))
  await screen.findByText('Study stub')
  await userEvent.click(screen.getByRole('link', { name: 'Bank' }))
  await screen.findByRole('link', { name: /TCP handshake/ })
  expect(file().closest('label')).toHaveTextContent('Uploading…')
  expect(file()).toBeDisabled()
  vi.mocked(api.bank).mockResolvedValueOnce([...bank, { id: 7, name: 'Routing', summary: 'tables', sourcePages: null, lecture: null, questions: [] }])
  land({ id: 2, filename: 'week1.pdf', status: 'INGESTED', errorMessage: null })
  await screen.findByRole('link', { name: /Routing/ })
  expect(screen.getByText('3 concepts')).toBeInTheDocument()
  expect(vi.mocked(api.overview).mock.calls.length).toBe(overviewCalls + 1)
  expect(file().closest('label')).toHaveTextContent('Add a lecture')
  expect(file()).toBeEnabled()
})

test('re-clicking the Bank tab from inside the bank does not grow the history', async () => {
  renderBankInBrowser('/courses/1/bank/5')
  await screen.findByRole('heading', { level: 2, name: 'TCP handshake' })
  const before = window.history.length
  await userEvent.click(screen.getByRole('link', { name: 'Bank' }))
  await waitFor(() => expect(window.location.pathname).toBe('/courses/1/bank/5'))
  await screen.findByRole('heading', { level: 2, name: 'TCP handshake' })
  expect(window.history.length).toBe(before)
})

test('opening a row from the keyboard puts the caret on the open concept, its cards one Tab away', async () => {
  renderBank('/courses/1/bank/5')
  const row = await screen.findByRole('link', { name: /Sockets/ })
  row.focus()
  await userEvent.keyboard('{Enter}')
  await screen.findByRole('heading', { level: 2, name: 'Sockets' })
  expect(document.getElementById('concept')).toHaveFocus()
  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'Label' })).toHaveFocus()
})

test('polls until a pending ingest finishes', async () => {
  vi.mocked(api.upload).mockResolvedValueOnce({ id: 2, filename: 'week1.pdf', status: 'PENDING', errorMessage: null })
  vi.mocked(api.material)
    .mockResolvedValueOnce({ id: 2, filename: 'week1.pdf', status: 'PENDING', errorMessage: null })
    .mockResolvedValueOnce({ id: 2, filename: 'week1.pdf', status: 'INGESTED', errorMessage: null })
  const { container } = renderBank('/courses/1/bank')
  await screen.findByRole('link', { name: /TCP handshake/ })
  const bankCalls = vi.mocked(api.bank).mock.calls.length
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  await userEvent.upload(input, new File(['%PDF-1.4'], 'week1.pdf', { type: 'application/pdf' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Ingesting…'))
  await waitFor(() => expect(api.material).toHaveBeenCalled(), { timeout: 8000 })
  await waitFor(() => expect(input.closest('label')).toHaveTextContent('Add a lecture'), { timeout: 8000 })
  await waitFor(() => expect(vi.mocked(api.bank).mock.calls.length).toBe(bankCalls + 1), { timeout: 8000 })
})

test('the lectures sit closed under the list head, and open in place', async () => {
  renderBank('/courses/1/bank')
  await screen.findByRole('link', { name: /TCP handshake/ })
  const lectures = screen.getByRole('button', { name: 'Lectures (1)' })
  expect(lectures).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('list', { name: 'Lectures' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  await userEvent.click(lectures)
  expect(lectures).toHaveAttribute('aria-expanded', 'true')
  expect(within(screen.getByRole('list', { name: 'Lectures' })).getByText('Reliable transport')).toBeInTheDocument()
  await userEvent.click(lectures)
  expect(screen.queryByRole('list', { name: 'Lectures' })).not.toBeInTheDocument()
})

test('a course with no lectures shows no lectures control', async () => {
  vi.mocked(api.lectures).mockResolvedValue([])
  renderBank('/courses/1/bank')
  await screen.findByRole('link', { name: /TCP handshake/ })
  expect(screen.queryByRole('button', { name: /Lectures/ })).not.toBeInTheDocument()
})

test('the concept list comes before anything else on the tab: no form, no lecture rows', async () => {
  const { container } = renderBank('/courses/1/bank/5')
  await screen.findByRole('heading', { level: 2, name: 'TCP handshake' })
  // the split is the first thing under the course head, so the list and the questions open the tab
  expect(container.querySelector('.course-head')!.nextElementSibling).toHaveClass('split')
  expect(container.querySelector('.bank-generate')).toBeNull()
  expect(container.querySelector('.lecture-manage')).toBeNull()
  // the pickers for generating show only while that form is open
  expect(screen.queryByRole('checkbox', { name: /Generate for/ })).not.toBeInTheDocument()
})

test('deleting a lecture removes it and refreshes the bank', async () => {
  const { container } = renderBank('/courses/1/bank')
  await screen.findByRole('link', { name: /TCP handshake/ })
  await userEvent.click(screen.getByRole('button', { name: 'Lectures (1)' }))
  expect(screen.getByText('Reliable transport')).toBeInTheDocument()
  const bankCalls = vi.mocked(api.bank).mock.calls.length
  const overviewCalls = vi.mocked(api.overview).mock.calls.length
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
  expect(api.deleteLecture).not.toHaveBeenCalled()
  vi.mocked(api.lectures).mockResolvedValueOnce([])
  await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
  await waitFor(() => expect(api.deleteLecture).toHaveBeenCalledWith(11))
  await waitFor(() => expect(vi.mocked(api.bank).mock.calls.length).toBe(bankCalls + 1))
  await waitFor(() => expect(vi.mocked(api.overview).mock.calls.length).toBe(overviewCalls + 1))
  expect(container.querySelector('.lecture-manage')).toBeNull()
})

test('the upload hint says a same-name upload replaces', async () => {
  const { container } = renderBank('/courses/1/bank')
  await screen.findByRole('link', { name: /TCP handshake/ })
  expect(container.querySelector('.hint')).toHaveTextContent('same name replaces')
})

test('the picker takes every readable kind of file, several at a time, and sends them in turn', async () => {
  type Upload = Awaited<ReturnType<typeof api.upload>>
  let landFirst!: (m: Upload) => void
  vi.mocked(api.upload)
    .mockReturnValueOnce(new Promise<Upload>(resolve => { landFirst = resolve }))
    .mockResolvedValueOnce({ id: 3, filename: 'notes.docx', status: 'INGESTED', errorMessage: null })
  const { container } = renderBank('/courses/1/bank')
  await screen.findByRole('link', { name: /TCP handshake/ })
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  expect(input).toHaveAttribute('multiple')
  for (const kind of ['.pdf', '.pptx', '.docx', '.png', '.jpg', '.html', '.txt', '.md']) {
    expect(input.accept.split(',')).toContain(kind)
  }
  const deck = new File(['PK'], 'week2.pptx')
  const notes = new File(['PK'], 'notes.docx')
  await userEvent.upload(input, [deck, notes])
  await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1))
  expect(api.upload).toHaveBeenCalledWith(1, deck)
  expect(container.querySelector('.hint')).toHaveTextContent('week2.pptx · 1 more after it')
  landFirst({ id: 2, filename: 'week2.pptx', status: 'INGESTED', errorMessage: null })
  await waitFor(() => expect(api.upload).toHaveBeenLastCalledWith(1, notes))
  await waitFor(() => expect(input.closest('label')).toHaveTextContent('Add a lecture'))
})

test('Generate more questions opens the form in place, with a picker on each row, and closes it again', async () => {
  renderBank('/courses/1/bank/5')
  await screen.findByRole('heading', { level: 2, name: 'TCP handshake' })
  const open = screen.getByRole('button', { name: 'Generate more questions' })
  expect(open).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(open)
  expect(open).toHaveAttribute('aria-expanded', 'true')
  const form = screen.getByRole('region', { name: 'Generate more questions' })
  expect(within(form).getByRole('spinbutton', { name: 'Count' })).toHaveValue(5)
  expect(screen.getByRole('checkbox', { name: 'Generate for TCP handshake' })).not.toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Generate for Sockets' })).toBeInTheDocument()
  await userEvent.click(open)
  expect(screen.queryByRole('region', { name: 'Generate more questions' })).not.toBeInTheDocument()
  expect(screen.queryByRole('checkbox', { name: /Generate for/ })).not.toBeInTheDocument()
})

test('Generate stays off until a concept is checked, and All concepts and None set every row', async () => {
  renderBank('/courses/1/bank/5')
  await screen.findByRole('heading', { level: 2, name: 'TCP handshake' })
  await userEvent.click(screen.getByRole('button', { name: 'Generate more questions' }))
  expect(screen.getByRole('button', { name: /Generate · 5 questions/ })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'All concepts' }))
  expect(screen.getByRole('checkbox', { name: 'Generate for TCP handshake' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Generate for Sockets' })).toBeChecked()
  expect(screen.getByRole('button', { name: /Generate · 5 questions/ })).toBeEnabled()
  await userEvent.click(screen.getByRole('button', { name: 'None' }))
  expect(screen.getByRole('checkbox', { name: 'Generate for TCP handshake' })).not.toBeChecked()
  expect(screen.getByRole('button', { name: /Generate · 5 questions/ })).toBeDisabled()
})

test('an empty bank offers no generate button', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce([])
  renderBank('/courses/1/bank')
  await screen.findByText(/No concepts yet/)
  expect(screen.queryByRole('button', { name: 'Generate more questions' })).not.toBeInTheDocument()
})

test('generate more asks the API for the checked concepts and refreshes the bank', async () => {
  vi.mocked(api.generateMore).mockResolvedValueOnce([])
  renderBank('/courses/1/bank/5')
  await screen.findByRole('heading', { level: 2, name: 'TCP handshake' })
  await userEvent.click(screen.getByRole('button', { name: 'Generate more questions' }))
  await userEvent.click(screen.getByRole('checkbox', { name: 'Generate for TCP handshake' }))
  const bankCalls = vi.mocked(api.bank).mock.calls.length
  await userEvent.click(screen.getByRole('button', { name: /Generate · 5 questions/ }))
  await waitFor(() => expect(api.generateMore).toHaveBeenCalledWith(1, {
    conceptIds: [5], count: 5, types: 'BOTH',
  }))
  await waitFor(() => expect(vi.mocked(api.bank).mock.calls.length).toBe(bankCalls + 1))
})

test('a quiz handoff opens the form with its concepts pre-checked, then clears the query', async () => {
  renderBank('/courses/1/bank/5?concepts=5,6')
  await screen.findByRole('heading', { level: 2, name: 'TCP handshake' })
  expect(screen.getByRole('button', { name: 'Generate more questions' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('region', { name: 'Generate more questions' })).toBeInTheDocument()
  await waitFor(() => {
    expect(screen.getByRole('checkbox', { name: 'Generate for TCP handshake' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Generate for Sockets' })).toBeChecked()
  })
  await waitFor(() => {
    expect(window.location.search).not.toContain('concepts=')
  })
})

test('a handoff keeps only the concepts this bank has', async () => {
  vi.mocked(api.generateMore).mockResolvedValueOnce([])
  renderBank('/courses/1/bank/5?concepts=6,99')
  await screen.findByRole('heading', { level: 2, name: 'TCP handshake' })
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Generate for Sockets' })).toBeChecked())
  expect(screen.getByRole('checkbox', { name: 'Generate for TCP handshake' })).not.toBeChecked()
  await userEvent.click(screen.getByRole('button', { name: /Generate · 5 questions/ }))
  await waitFor(() => expect(api.generateMore).toHaveBeenCalledWith(1, { conceptIds: [6], count: 5, types: 'BOTH' }))
})
