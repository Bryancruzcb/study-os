import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import heic2any from 'heic2any'
import { vi } from 'vitest'
import { api } from '../api'
import { renderInCourse } from '../test/render'
import { UploadQueueProvider } from './UploadQueue'
import { useIngest } from './uploadState'

const course = { id: 1, name: 'CS 158A', term: 'Fall 2026', concepts: 2, questions: 3, dueToday: 2, archived: false }

vi.mock('../api', () => ({
  api: {
    overview: vi.fn(),
    upload: vi.fn(),
    uploadPhotos: vi.fn(),
    material: vi.fn(),
  },
}))
vi.mock('heic2any', () => ({ default: vi.fn() }))

type Upload = Awaited<ReturnType<typeof api.upload>>
const ingested = (id: number, filename: string): Upload => ({ id, filename, status: 'INGESTED', errorMessage: null })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.overview).mockResolvedValue([course])
  // only the clock's date is faked, so the offered name is the same every run and timers still run
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 20, 9, 30))
})

afterEach(() => vi.useRealTimers())

/* jsdom has no DragEvent, so a drop is a plain event carrying the parts the hook reads */
function drop(files: File[]) {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files, dropEffect: 'none' } })
  fireEvent(window, event)
}

const photo = (name: string) => new File(['jpeg'], name, { type: 'image/jpeg' })

/* a course's standing as one line, and a button that uploads one file into it */
function Course({ id, file }: { id: number; file: File }) {
  const ingest = useIngest(id)
  return (
    <>
      <p data-testid={`course-${id}`}>{ingest.phase} {ingest.current ?? '-'} waiting {ingest.waiting} finished {ingest.finished}</p>
      <button type="button" onClick={() => ingest.upload([file])}>Upload into {id}</button>
    </>
  )
}

test('one worker serves every course: a file for a second course waits for the first course’s', async () => {
  let landFirst!: (m: Upload) => void
  vi.mocked(api.upload)
    .mockReturnValueOnce(new Promise<Upload>(resolve => { landFirst = resolve }))
    .mockResolvedValueOnce(ingested(3, 'b.pdf'))
  const a = new File(['%PDF'], 'a.pdf')
  const b = new File(['%PDF'], 'b.pdf')
  render(
    <UploadQueueProvider>
      <Course id={1} file={a} />
      <Course id={2} file={b} />
    </UploadQueueProvider>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Upload into 1' }))
  await userEvent.click(screen.getByRole('button', { name: 'Upload into 2' }))

  await waitFor(() => expect(screen.getByTestId('course-1')).toHaveTextContent('uploading a.pdf waiting 0 finished 0'))
  expect(screen.getByTestId('course-2')).toHaveTextContent('waiting - waiting 1 finished 0')
  expect(api.upload).toHaveBeenCalledTimes(1)

  landFirst(ingested(2, 'a.pdf'))
  await waitFor(() => expect(screen.getByTestId('course-2')).toHaveTextContent('idle - waiting 0 finished 1'))
  expect(api.upload).toHaveBeenLastCalledWith(2, b)
  expect(screen.getByTestId('course-1')).toHaveTextContent('idle - waiting 0 finished 1')
})

test('two photos and nothing else ask first, in the page, with a name from today', async () => {
  renderInCourse(<p>Study stub</p>, 'study')
  await screen.findByText('Study stub')
  drop([photo('IMG_2.jpg'), photo('IMG_1.jpg')])
  const ask = await screen.findByRole('region', { name: '2 photos: make them one lecture, or 2 separate lectures?' })
  expect(ask).toBeInTheDocument()
  // asked in the page, not a dialog, with the caret on the name
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByLabelText('Lecture name')).toHaveValue('Photos, Nov 20, 9:30 AM')
  expect(screen.getByLabelText('Lecture name')).toHaveFocus()
  expect(api.upload).not.toHaveBeenCalled()
  expect(api.uploadPhotos).not.toHaveBeenCalled()
})

test('one lecture sends the photos together, in name order, under the name typed', async () => {
  vi.mocked(api.uploadPhotos).mockResolvedValueOnce({ id: 7, filename: 'Week 3 board.pdf', status: 'PENDING', errorMessage: null })
  vi.mocked(api.material).mockResolvedValueOnce({ id: 7, filename: 'Week 3 board.pdf', status: 'INGESTED', errorMessage: null })
  renderInCourse(<p>Study stub</p>, 'study')
  await screen.findByText('Study stub')
  const second = photo('IMG_10.jpg')
  const first = photo('IMG_9.jpg')
  drop([second, first])
  const name = await screen.findByLabelText('Lecture name')
  await userEvent.clear(name)
  await userEvent.type(name, '  Week 3 board ')
  await userEvent.click(screen.getByRole('button', { name: 'One lecture' }))

  await waitFor(() => expect(api.uploadPhotos).toHaveBeenCalledWith(1, 'Week 3 board', [first, second]))
  expect(api.upload).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('Lecture name')).toBeNull()
  expect(await screen.findByRole('status')).toHaveTextContent('Reading Week 3 board (2 photos) for concepts and questions…')
  await waitFor(() => expect(api.material).toHaveBeenCalledWith(7), { timeout: 3000 })
  await waitFor(() => expect(screen.getByRole('status')).toBeEmptyDOMElement())
})

test('One lecture waits for a name', async () => {
  renderInCourse(<p>Study stub</p>, 'study')
  await screen.findByText('Study stub')
  drop([photo('a.jpg'), photo('b.jpg')])
  await userEvent.clear(await screen.findByLabelText('Lecture name'))
  expect(screen.getByRole('button', { name: 'One lecture' })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Lecture name'), '   ')
  expect(screen.getByRole('button', { name: 'One lecture' })).toBeDisabled()
})

test('separate lectures send each photo on its own, in name order', async () => {
  vi.mocked(api.upload)
    .mockResolvedValueOnce(ingested(2, 'IMG_1.jpg'))
    .mockResolvedValueOnce(ingested(3, 'IMG_2.jpg'))
  renderInCourse(<p>Study stub</p>, 'study')
  await screen.findByText('Study stub')
  const one = photo('IMG_1.jpg')
  const two = photo('IMG_2.jpg')
  drop([two, one])
  await userEvent.click(await screen.findByRole('button', { name: '2 separate lectures' }))
  await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(2))
  expect(vi.mocked(api.upload).mock.calls).toEqual([[1, one], [1, two]])
  expect(api.uploadPhotos).not.toHaveBeenCalled()
})

test('Cancel sends nothing and takes the question away', async () => {
  renderInCourse(<p>Study stub</p>, 'study')
  await screen.findByText('Study stub')
  drop([photo('a.jpg'), photo('b.jpg')])
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('region', { name: /photos/ })).toBeNull()
  expect(api.upload).not.toHaveBeenCalled()
  expect(api.uploadPhotos).not.toHaveBeenCalled()
})

test('photos dropped while the question is open join it', async () => {
  renderInCourse(<p>Study stub</p>, 'study')
  await screen.findByText('Study stub')
  drop([photo('a.jpg'), photo('b.jpg')])
  await screen.findByRole('region', { name: /^2 photos/ })
  drop([photo('c.jpg'), photo('d.jpg'), photo('e.jpg')])
  expect(await screen.findByRole('region', { name: '5 photos: make them one lecture, or 5 separate lectures?' })).toBeInTheDocument()
})

test('a single photo dropped while the question is open joins it instead of going alone', async () => {
  renderInCourse(<p>Study stub</p>, 'study')
  await screen.findByText('Study stub')
  drop([photo('a.jpg'), photo('b.jpg')])
  await screen.findByRole('region', { name: /^2 photos/ })
  drop([photo('c.jpg')])
  expect(await screen.findByRole('region', { name: '3 photos: make them one lecture, or 3 separate lectures?' })).toBeInTheDocument()
  expect(api.upload).not.toHaveBeenCalled()
})

test('a set over what one lecture can be read at is stopped in the browser', async () => {
  // jsdom cannot draw, so the photos go at the size they arrive: two of 12 MB come to 24 MB
  const big = (name: string) => new File([new Uint8Array(12 * 1024 * 1024)], name, { type: 'image/jpeg' })
  renderInCourse(<p>Study stub</p>, 'study')
  await screen.findByText('Study stub')
  drop([big('a.jpg'), big('b.jpg')])
  await userEvent.click(await screen.findByRole('button', { name: 'One lecture' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'the photos come to 24.0 MB even after shrinking, over the 22 MB one lecture can take. Send them as two smaller sets.')
  expect(api.uploadPhotos).not.toHaveBeenCalled()
})

test('a drop with anything but photos never asks: each file goes on its own as before', async () => {
  vi.mocked(api.upload)
    .mockResolvedValueOnce(ingested(2, 'board.jpg'))
    .mockResolvedValueOnce(ingested(3, 'week1.pdf'))
  renderInCourse(<p>Study stub</p>, 'study')
  await screen.findByText('Study stub')
  const board = photo('board.jpg')
  const deck = new File(['%PDF'], 'week1.pdf', { type: 'application/pdf' })
  drop([board, deck])
  await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(2))
  expect(vi.mocked(api.upload).mock.calls).toEqual([[1, board], [1, deck]])
  expect(screen.queryByLabelText('Lecture name')).toBeNull()
})

test('more photos than one lecture takes can only go separately', async () => {
  renderInCourse(<p>Study stub</p>, 'study')
  await screen.findByText('Study stub')
  drop(Array.from({ length: 51 }, (_, i) => photo(`IMG_${i}.jpg`)))
  expect(await screen.findByRole('button', { name: 'One lecture' })).toBeDisabled()
  expect(screen.getByText(/One lecture takes at most 50 photos/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '51 separate lectures' })).toBeEnabled()
})

test('a set the server turns down says which photo and why', async () => {
  vi.mocked(api.uploadPhotos).mockResolvedValueOnce({
    id: 8, filename: 'Photos, Nov 20, 9:30 AM.pdf', status: 'FAILED',
    errorMessage: 'Photo 2 ("handout.jpg") is not a picture. Take it out and send the photos again.',
  })
  renderInCourse(<p>Study stub</p>, 'study')
  await screen.findByText('Study stub')
  drop([photo('a.jpg'), photo('handout.jpg')])
  await userEvent.click(await screen.findByRole('button', { name: 'One lecture' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Photos, Nov 20, 9:30 AM (2 photos): Photo 2 ("handout.jpg") is not a picture.')
})

test('a name another lecture already has comes back as the server’s sentence', async () => {
  vi.mocked(api.uploadPhotos).mockRejectedValueOnce(
    new Error('This course already has a lecture called "Week 4". Give these photos another name and send them again.'))
  renderInCourse(<p>Study stub</p>, 'study')
  await screen.findByText('Study stub')
  drop([photo('a.jpg'), photo('b.jpg')])
  const name = await screen.findByLabelText('Lecture name')
  await userEvent.clear(name)
  await userEvent.type(name, 'Week 4')
  await userEvent.click(screen.getByRole('button', { name: 'One lecture' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Week 4 (2 photos): This course already has a lecture called "Week 4". Give these photos another name')
})

test('an iPhone photo is converted to JPEG in the browser before it is sent', async () => {
  vi.mocked(heic2any).mockResolvedValueOnce(new Blob(['jpeg'], { type: 'image/jpeg' }))
  vi.mocked(api.upload).mockResolvedValueOnce(ingested(2, 'IMG_0042.jpg'))
  renderInCourse(<p>Study stub</p>, 'study')
  await screen.findByText('Study stub')
  drop([new File(['heic'], 'IMG_0042.HEIC', { type: 'image/heic' })])
  await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1))
  const sent = vi.mocked(api.upload).mock.calls[0][1]
  expect(sent.name).toBe('IMG_0042.jpg')
  expect(sent.type).toBe('image/jpeg')
})

test('a HEIC this browser cannot convert is reported and never sent, and stops its set', async () => {
  vi.mocked(heic2any).mockRejectedValue(new Error('format not supported'))
  renderInCourse(<p>Study stub</p>, 'study')
  await screen.findByText('Study stub')
  drop([photo('IMG_0041.jpg'), new File(['heic'], 'IMG_0042.HEIC')])
  await userEvent.click(await screen.findByRole('button', { name: 'One lecture' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    "IMG_0042.HEIC couldn't be converted in this browser. Export it as JPEG and try again.")
  expect(api.uploadPhotos).not.toHaveBeenCalled()
  vi.mocked(heic2any).mockReset()
})
