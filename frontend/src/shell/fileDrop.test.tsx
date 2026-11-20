import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { api } from '../api'
import { renderInCourse } from '../test/render'
import { useFileDropGuard } from './fileDrop'

const course = { id: 1, name: 'CS 158A', term: 'Fall 2026', concepts: 2, questions: 3, dueToday: 2, archived: false }

vi.mock('../api', () => ({
  api: {
    overview: vi.fn(),
    upload: vi.fn(),
    material: vi.fn(),
  },
}))

type Upload = Awaited<ReturnType<typeof api.upload>>

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.overview).mockResolvedValue([course])
})

/* jsdom has no DragEvent, so a drag is a plain event carrying the parts the hook reads */
function drag(type: string, files: File[] = [], types: string[] = ['Files']) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { types, files, dropEffect: 'none' } })
  return event
}

const ingested = (id: number, filename: string): Upload => ({ id, filename, status: 'INGESTED', errorMessage: null })

test('files dropped on any course page upload one after another, and the page says how it is going', async () => {
  let landFirst!: (m: Upload) => void
  vi.mocked(api.upload)
    .mockReturnValueOnce(new Promise<Upload>(resolve => { landFirst = resolve }))
    .mockResolvedValueOnce(ingested(3, 'week2.pptx'))
  renderInCourse(<p>Study stub</p>, 'study')
  await screen.findByText('Study stub')

  fireEvent(window, drag('dragenter'))
  expect(screen.getByText('Drop to add to CS 158A')).toBeInTheDocument()

  const first = new File(['%PDF-1.4'], 'week1.pdf', { type: 'application/pdf' })
  const second = new File(['PK'], 'week2.pptx')
  fireEvent(window, drag('drop', [first, second]))
  expect(screen.queryByText('Drop to add to CS 158A')).toBeNull()

  // the second waits for the first, so they never race each other to the server
  await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1))
  expect(api.upload).toHaveBeenCalledWith(1, first)
  expect(screen.getByRole('status')).toHaveTextContent('Uploading week1.pdf… 1 more file after it.')

  landFirst(ingested(2, 'week1.pdf'))
  await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(2))
  expect(api.upload).toHaveBeenLastCalledWith(1, second)
  await waitFor(() => expect(screen.getByRole('status')).toBeEmptyDOMElement())
  // the head's counts are refetched once files land; two landing together can share one refetch
  await waitFor(() => expect(vi.mocked(api.overview).mock.calls.length).toBeGreaterThanOrEqual(2))
})

test('a file that is plainly not a lecture is refused before it is sent, and the note can be dismissed', async () => {
  renderInCourse(<p>Study stub</p>, 'study')
  await screen.findByText('Study stub')
  fireEvent(window, drag('drop', [new File(['x'], 'lecture-recording.mp4')]))
  expect(await screen.findByRole('alert')).toHaveTextContent('lecture-recording.mp4 is not a lecture file')
  expect(api.upload).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(screen.queryByRole('alert')).toBeNull()
})

test('each failure in a batch gets its own line naming its file', async () => {
  vi.mocked(api.upload)
    .mockResolvedValueOnce({ id: 2, filename: 'old.ppt', status: 'FAILED', errorMessage: 'This is an older Office file.' })
    .mockResolvedValueOnce(ingested(3, 'ok.pdf'))
  renderInCourse(<p>Study stub</p>, 'study')
  await screen.findByText('Study stub')
  fireEvent(window, drag('drop', [new File(['x'], 'old.ppt'), new File(['%PDF'], 'ok.pdf'), new File([], 'Week 3')]))
  const alert = await screen.findByRole('alert')
  await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(alert).toHaveTextContent('old.ppt: This is an older Office file.'))
  expect(alert).toHaveTextContent('Week 3 is empty. If it is a folder, open it and drop the files inside.')
  expect(alert).not.toHaveTextContent('ok.pdf')
})

test('the overlay leaves with the drag, and a drag of text is left to the browser', async () => {
  renderInCourse(<p>Study stub</p>, 'study')
  await screen.findByText('Study stub')
  // entering a child fires a second dragenter before the first dragleave
  fireEvent(window, drag('dragenter'))
  fireEvent(window, drag('dragenter'))
  fireEvent(window, drag('dragleave'))
  expect(screen.getByText('Drop to add to CS 158A')).toBeInTheDocument()
  fireEvent(window, drag('dragleave'))
  expect(screen.queryByText('Drop to add to CS 158A')).toBeNull()

  const text = drag('dragover', [], ['text/plain'])
  fireEvent(window, drag('dragenter', [], ['text/plain']))
  fireEvent(window, text)
  expect(screen.queryByText('Drop to add to CS 158A')).toBeNull()
  expect(text.defaultPrevented).toBe(false)
})

test('outside a course, a dropped file does not replace the app and the drop shows as not allowed', () => {
  function Guarded() {
    useFileDropGuard()
    return <p>Home</p>
  }
  render(<Guarded />)
  const over = drag('dragover')
  fireEvent(window, over)
  expect(over.defaultPrevented).toBe(true)
  expect((over as unknown as { dataTransfer: { dropEffect: string } }).dataTransfer.dropEffect).toBe('none')
  const dropped = drag('drop', [new File(['%PDF'], 'week1.pdf')])
  fireEvent(window, dropped)
  expect(dropped.defaultPrevented).toBe(true)
})
