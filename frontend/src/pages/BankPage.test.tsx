import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { vi } from 'vitest'
import { api } from '../api'
import { renderBank } from '../test/render'

const course = { id: 1, name: 'CS 158A', term: 'Fall 2026', concepts: 2, questions: 3, dueToday: 2 }

const bank = [
  {
    id: 5, name: 'TCP handshake', summary: 'SYN/SYN-ACK/ACK', sourcePages: '3,4',
    questions: [
      { id: 9, type: 'MC' as const, prompt: 'Steps?', optionsJson: '["1","2","3","4"]', correctIndex: 2, sourcePages: '3', status: 'ACTIVE' as const, labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null },
      { id: 10, type: 'SHORT_ANSWER' as const, prompt: 'Why three?', optionsJson: null, correctIndex: null, sourcePages: '4', status: 'RETIRED' as const, labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null },
    ],
  },
  {
    id: 6, name: 'Sockets', summary: 'bind/listen/accept', sourcePages: null,
    questions: [
      { id: 11, type: 'SHORT_ANSWER' as const, prompt: 'What does bind do?', optionsJson: null, correctIndex: null, sourcePages: null, status: 'ACTIVE' as const, labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null },
    ],
  },
]

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
  vi.mocked(api.bank).mockResolvedValue(bank)
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
  vi.mocked(api.bank).mockRejectedValueOnce(new Error('500 /api/courses/1/bank'))
  renderBank('/courses/1/bank')
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/courses/1/bank')
})

test('the upload control sits in the course head and refreshes the bank and the counts', async () => {
  vi.mocked(api.upload).mockResolvedValueOnce({ id: 2, filename: 'week1.pdf', status: 'INGESTED', errorMessage: null })
  const { container } = renderBank('/courses/1/bank')
  await screen.findByRole('link', { name: /TCP handshake/ })
  const bankCalls = vi.mocked(api.bank).mock.calls.length
  const overviewCalls = vi.mocked(api.overview).mock.calls.length
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  expect(input.closest('label')).toHaveTextContent('Upload a lecture PDF')
  // the control is portaled into the course head, beside the tabs
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
  renderBank('/courses/1/bank/5')
  const heading = await screen.findByRole('heading', { level: 2, name: 'TCP handshake' })
  const list = screen.getByRole('navigation', { name: 'Concepts' })
  const skip = within(list).getAllByRole('link')[0]
  expect(skip).toHaveTextContent('Skip to the open concept')
  expect(skip).toHaveAttribute('href', '#concept')
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
  expect(input.closest('label')).toHaveTextContent('Ingesting…')
  expect(input).toBeDisabled()
  land({ id: 2, filename: 'week1.pdf', status: 'INGESTED', errorMessage: null })
  await waitFor(() => expect(input.closest('label')).toHaveTextContent('Upload a lecture PDF'))
  expect(input).toBeEnabled()
})

test('a deep link scrolls the open concept into view in the list', async () => {
  // jsdom has no layout and no scrollIntoView, so the call is the whole assertion
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
  expect(file().closest('label')).toHaveTextContent('Ingesting…')
  await userEvent.click(screen.getByRole('link', { name: 'Study' }))
  await screen.findByText('Study stub')
  await userEvent.click(screen.getByRole('link', { name: 'Bank' }))
  await screen.findByRole('link', { name: /TCP handshake/ })
  // still running: the control says so and takes no second file
  expect(file().closest('label')).toHaveTextContent('Ingesting…')
  expect(file()).toBeDisabled()
  vi.mocked(api.bank).mockResolvedValueOnce([...bank, { id: 7, name: 'Routing', summary: 'tables', sourcePages: null, questions: [] }])
  land({ id: 2, filename: 'week1.pdf', status: 'INGESTED', errorMessage: null })
  // the list, its caption and the head move together
  await screen.findByRole('link', { name: /Routing/ })
  expect(screen.getByText('3 concepts')).toBeInTheDocument()
  expect(vi.mocked(api.overview).mock.calls.length).toBe(overviewCalls + 1)
  expect(file().closest('label')).toHaveTextContent('Upload a lecture PDF')
  expect(file()).toBeEnabled()
})
