import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SERVER_PROBLEM } from '../errors'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { api, type Course } from '../api'
import { dueSplit } from '../shell/courses'
import { commonTerm } from './commonTerm'
import { UploadQueueProvider } from '../shell/UploadQueue'
import HomePage from './HomePage'

const overview = [
  { id: 1, name: 'CS 47', term: 'Spring 2026', concepts: 18, questions: 55, dueToday: 11, archived: false },
  { id: 2, name: 'CS 149', term: 'Fall 2026', concepts: 248, questions: 844, dueToday: 16, archived: false },
]

vi.mock('../api', () => ({
  api: {
    overview: vi.fn(),
    createCourse: vi.fn(),
    setArchived: vi.fn().mockResolvedValue(undefined),
    deleteCourse: vi.fn().mockResolvedValue(undefined),
    upload: vi.fn(),
    uploadPhotos: vi.fn(),
    material: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.overview).mockResolvedValue(overview)
})

function Probe() {
  const { pathname } = useLocation()
  return <p>at {pathname}</p>
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
    { wrapper: UploadQueueProvider },
  )
}

test('dueSplit names every course', () => {
  expect(dueSplit([])).toBe('')
  expect(dueSplit([overview[0]])).toBe('11 in CS 47')
  expect(dueSplit(overview)).toBe('11 in CS 47 and 16 in CS 149')
  expect(dueSplit([...overview, { id: 3, name: 'CS 158A', term: 'Fall 2026', concepts: 39, questions: 139, dueToday: 16, archived: false }]))
    .toBe('11 in CS 47, 16 in CS 149 and 16 in CS 158A')
})

test('draws a tile per course with its figure and counts, linking into the course', async () => {
  renderHome()
  const tile = await screen.findByRole('link', { name: /CS 149/ })
  expect(tile).toHaveAttribute('href', '/courses/2/study')
  expect(tile).toHaveTextContent('16')
  expect(tile).toHaveTextContent('248 concepts · 844 questions')
  expect(screen.getByRole('link', { name: /CS 47/ })).toHaveAttribute('href', '/courses/1/study')
})

test('a tile shows its term only when it differs from the term most courses share', async () => {
  renderHome()
  const spring = await screen.findByRole('link', { name: /CS 47/ })
  expect(spring).toHaveTextContent('Spring 2026')
  expect(screen.getByRole('link', { name: /CS 149/ })).not.toHaveTextContent('Fall 2026')
})

test('commonTerm picks the most shared term and, on a tie, the newest course', () => {
  const c = (id: number, term: string) => ({ id, name: `C${id}`, term, concepts: 0, questions: 0, dueToday: 0, archived: false })
  expect(commonTerm([])).toBeUndefined()
  expect(commonTerm([c(1, 'Spring 2026'), c(2, 'Fall 2026')])).toBe('Fall 2026')
  expect(commonTerm([c(1, 'Spring 2026'), c(2, 'Spring 2026'), c(3, 'Fall 2026')])).toBe('Spring 2026')
})

test('a course with something due offers Study N, and a course with nothing due says so quietly', async () => {
  vi.mocked(api.overview).mockResolvedValueOnce([
    { id: 1, name: 'CS 47', term: 'Fall 2026', concepts: 18, questions: 55, dueToday: 0, archived: false },
    { id: 2, name: 'CS 149', term: 'Fall 2026', concepts: 248, questions: 844, dueToday: 6, archived: false },
  ])
  renderHome()
  expect(await screen.findByRole('link', { name: 'Study 6' })).toHaveAttribute('href', '/courses/2/study')
  expect(screen.queryByRole('link', { name: /^Study 0/ })).not.toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: /^Study/ })).toHaveLength(1)
  const quiet = screen.getByRole('link', { name: /CS 47/ })
  expect(quiet).toHaveTextContent('Nothing due')
  expect(quiet).not.toHaveTextContent('due today')
  expect(quiet).toHaveAttribute('href', '/courses/1/study')
})

test('the hero sums what is due and names the split', async () => {
  renderHome()
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('27 due today.')
  expect(screen.getByText(/11 in CS 47 and 16 in CS 149/)).toBeInTheDocument()
  expect(screen.getByText('Fall 2026 · 2 courses')).toBeInTheDocument()
})

test('with no courses the hero says so and only the new-course tile is drawn', async () => {
  vi.mocked(api.overview).mockResolvedValueOnce([])
  renderHome()
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('No courses yet.')
  expect(screen.queryByRole('link', { name: /due today/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'New course' })).toBeInTheDocument()
})

test('a failed overview shows the alert and no grid', async () => {
  vi.mocked(api.overview).mockRejectedValueOnce(new Error(SERVER_PROBLEM))
  renderHome()
  expect(await screen.findByRole('alert')).toHaveTextContent(SERVER_PROBLEM)
  expect(screen.queryByRole('heading', { name: 'Courses' })).not.toBeInTheDocument()
})

test('the new-course tile opens the form focused and prefilled with the newest term, and Escape closes it', async () => {
  renderHome()
  await userEvent.click(await screen.findByRole('button', { name: 'New course' }))
  expect(screen.getByLabelText('Name')).toHaveFocus()
  expect(screen.getByLabelText('Term')).toHaveValue('Fall 2026')
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'New course' })).toHaveFocus()
})

test('Create stays disabled until both fields hold more than whitespace', async () => {
  renderHome()
  await userEvent.click(await screen.findByRole('button', { name: 'New course' }))
  await userEvent.clear(screen.getByLabelText('Term'))
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Name'), '   ')
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Term'), 'Spring 2027')
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Name'), 'CS 158A')
  expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
})

test('creating a course posts the trimmed name and the term, then opens its bank', async () => {
  vi.mocked(api.createCourse).mockResolvedValueOnce({ id: 3, name: 'CS 158A', term: 'Fall 2026' })
  renderHome()
  await userEvent.click(await screen.findByRole('button', { name: 'New course' }))
  await userEvent.type(screen.getByLabelText('Name'), '  CS 158A  ')
  await userEvent.click(screen.getByRole('button', { name: 'Create' }))
  await waitFor(() => expect(api.createCourse).toHaveBeenCalledWith('CS 158A', 'Fall 2026'))
  expect(await screen.findByText('at /courses/3/bank')).toBeInTheDocument()
})

test('Create is disabled for as long as the create is in flight', async () => {
  let land!: (c: Course) => void
  vi.mocked(api.createCourse).mockReturnValueOnce(new Promise<Course>(resolve => { land = resolve }))
  renderHome()
  await userEvent.click(await screen.findByRole('button', { name: 'New course' }))
  await userEvent.type(screen.getByLabelText('Name'), 'CS 158A')
  await userEvent.click(screen.getByRole('button', { name: 'Create' }))
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  // Escape is ignored in flight, or the create would land on a form that is gone
  fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Escape' })
  expect(screen.getByLabelText('Name')).toBeInTheDocument()
  land({ id: 3, name: 'CS 158A', term: 'Fall 2026' })
  expect(await screen.findByText('at /courses/3/bank')).toBeInTheDocument()
})

test('a failed create shows the alert and leaves the form open with what was typed', async () => {
  vi.mocked(api.createCourse).mockRejectedValueOnce(new Error(SERVER_PROBLEM))
  renderHome()
  await userEvent.click(await screen.findByRole('button', { name: 'New course' }))
  await userEvent.type(screen.getByLabelText('Name'), 'CS 158A')
  await userEvent.click(screen.getByRole('button', { name: 'Create' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(SERVER_PROBLEM)
  expect(screen.getByLabelText('Name')).toHaveValue('CS 158A')
  expect(screen.getByLabelText('Term')).toHaveValue('Fall 2026')
  // the failure belonged to the form, so closing the form takes it off the page
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('cancelling hands the caret back to the new-course tile', async () => {
  renderHome()
  const open = await screen.findByRole('button', { name: 'New course' })
  await userEvent.click(open)
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'New course' })).toHaveFocus()
})

test('says Loading until the overview lands, with no grid and no alert yet', () => {
  vi.mocked(api.overview).mockReturnValueOnce(new Promise<never>(() => {}))
  renderHome()
  expect(screen.getByText('Loading courses…')).toBeInTheDocument()
  expect(screen.getByText('Loading courses…').parentElement).toHaveAttribute('aria-busy', 'true')
  expect(screen.queryByRole('heading', { name: 'Courses' })).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('counts read as singular when there is one of a thing', async () => {
  vi.mocked(api.overview).mockResolvedValueOnce([
    { id: 3, name: 'CS 158A', term: 'Fall 2026', concepts: 1, questions: 1, dueToday: 1, archived: false },
  ])
  renderHome()
  expect(await screen.findByText('Fall 2026 · 1 course')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /CS 158A/ })).toHaveTextContent('1 concept · 1 question')
})

const withArchived = [
  ...overview,
  { id: 3, name: 'CS 46A', term: 'Fall 2025', concepts: 40, questions: 120, dueToday: 9, archived: true },
]

test('an archived course leaves the grid and the due total and is listed under Archived', async () => {
  vi.mocked(api.overview).mockResolvedValue(withArchived)
  renderHome()
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('27 due today.')
  expect(screen.getByText('Fall 2026 · 2 courses')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /CS 46A/ })).toHaveAttribute('href', '/courses/3/bank')
  expect(screen.getByRole('heading', { name: 'Archived' })).toBeInTheDocument()
  expect(screen.getByText('Fall 2025 · 40 concepts · 120 questions')).toBeInTheDocument()
})

test('no Archived section when nothing is archived', async () => {
  renderHome()
  await screen.findByRole('link', { name: /CS 149/ })
  expect(screen.queryByRole('heading', { name: 'Archived' })).not.toBeInTheDocument()
})

test('Restore puts an archived course back and reloads the list', async () => {
  vi.mocked(api.overview).mockResolvedValueOnce(withArchived).mockResolvedValueOnce(overview)
  renderHome()
  await userEvent.click(await screen.findByRole('button', { name: 'Restore' }))
  expect(api.setArchived).toHaveBeenCalledWith(3, false)
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Archived' })).not.toBeInTheDocument())
})

test('Delete arms first, names what goes, and only deletes on the second click', async () => {
  vi.mocked(api.overview).mockResolvedValueOnce(withArchived).mockResolvedValueOnce(overview)
  renderHome()
  await userEvent.click(await screen.findByRole('button', { name: 'Delete course' }))
  expect(api.deleteCourse).not.toHaveBeenCalled()
  expect(screen.getByText(/Delete CS 46A and its 120 questions\? This can't be undone\./)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Delete course' }))
  await userEvent.click(screen.getByRole('button', { name: 'Delete forever' }))
  expect(api.deleteCourse).toHaveBeenCalledWith(3)
  await waitFor(() => expect(screen.queryByText(/CS 46A/)).not.toBeInTheDocument())
})

test('a failed delete keeps the course and shows why', async () => {
  vi.mocked(api.overview).mockResolvedValue(withArchived)
  vi.mocked(api.deleteCourse).mockRejectedValueOnce(new Error(SERVER_PROBLEM))
  renderHome()
  await userEvent.click(await screen.findByRole('button', { name: 'Delete course' }))
  await userEvent.click(screen.getByRole('button', { name: 'Delete forever' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(SERVER_PROBLEM)
  expect(screen.getByRole('link', { name: /CS 46A/ })).toBeInTheDocument()
})

/* jsdom has no DragEvent; testing-library hands the tile a plain event with this dataTransfer */
const files = (...list: File[]) => ({ dataTransfer: { types: ['Files'], files: list, dropEffect: 'none' } })

function dragOverWindow() {
  const event = new Event('dragenter', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files: [] } })
  fireEvent(window, event)
}

const tileOf = async (name: RegExp) => (await screen.findByRole('link', { name })).closest<HTMLElement>('.tile')!

test('a file drag on home says to drop it on a course, and the tile under it says which', async () => {
  renderHome()
  const tile = await tileOf(/CS 149/)
  dragOverWindow()
  expect(screen.getByText('Drop on a course to add a lecture')).toBeInTheDocument()

  const over = fireEvent.dragOver(tile, files())
  // marked handled, so the app-wide guard lets this drop through
  expect(over).toBe(false)
  expect(tile).toHaveClass('is-drop')
  expect(screen.getByText('Drop to add to CS 149')).toBeInTheDocument()
  expect(screen.queryByText('Drop on a course to add a lecture')).toBeNull()
  expect(await tileOf(/CS 47/)).not.toHaveClass('is-drop')

  fireEvent.dragLeave(tile)
  expect(tile).not.toHaveClass('is-drop')
  expect(screen.getByText('Drop on a course to add a lecture')).toBeInTheDocument()
})

test('a lecture dropped on a tile uploads into that course, and the tile says how it is going', async () => {
  type Upload = Awaited<ReturnType<typeof api.upload>>
  let land!: (m: Upload) => void
  vi.mocked(api.upload).mockReturnValueOnce(new Promise<Upload>(resolve => { land = resolve }))
  renderHome()
  const tile = await tileOf(/CS 149/)
  const deck = new File(['%PDF'], 'week4.pdf', { type: 'application/pdf' })
  dragOverWindow()
  fireEvent.dragOver(tile, files(deck))
  fireEvent.drop(tile, files(deck))

  await waitFor(() => expect(api.upload).toHaveBeenCalledWith(2, deck))
  expect(tile).not.toHaveClass('is-drop')
  expect(screen.queryByText('Drop on a course to add a lecture')).toBeNull()
  expect(tile.querySelector('[role="status"]')).toHaveTextContent('Uploading week4.pdf…')
  expect((await tileOf(/CS 47/)).querySelector('[role="status"]')).toBeEmptyDOMElement()

  const loads = vi.mocked(api.overview).mock.calls.length
  land({ id: 9, filename: 'week4.pdf', status: 'INGESTED', errorMessage: null })
  await waitFor(() => expect(tile.querySelector('[role="status"]')).toBeEmptyDOMElement())
  // the tile's counts follow the lecture that landed
  await waitFor(() => expect(vi.mocked(api.overview).mock.calls.length).toBe(loads + 1))
})

test('a failed upload from home names the course and the file, and can be dismissed', async () => {
  vi.mocked(api.upload).mockResolvedValueOnce({ id: 9, filename: 'old.ppt', status: 'FAILED', errorMessage: 'This is an older Office file.' })
  renderHome()
  const tile = await tileOf(/CS 47/)
  fireEvent.drop(tile, files(new File(['x'], 'old.ppt')))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('CS 47')
  expect(alert).toHaveTextContent('old.ppt: This is an older Office file.')
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(screen.queryByRole('alert')).toBeNull()
})

test('photos dropped on a tile ask on home, naming the course, and one lecture goes into it', async () => {
  vi.mocked(api.uploadPhotos).mockResolvedValueOnce({ id: 9, filename: 'Board.pdf', status: 'INGESTED', errorMessage: null })
  renderHome()
  const tile = await tileOf(/CS 149/)
  const a = new File(['jpeg'], 'IMG_1.jpg', { type: 'image/jpeg' })
  const b = new File(['jpeg'], 'IMG_2.jpg', { type: 'image/jpeg' })
  fireEvent.drop(tile, files(b, a))
  expect(await screen.findByRole('region', { name: '2 photos for CS 149: make them one lecture, or 2 separate lectures?' }))
    .toBeInTheDocument()
  const name = screen.getByLabelText('Lecture name')
  await userEvent.clear(name)
  await userEvent.type(name, 'Board')
  await userEvent.click(screen.getByRole('button', { name: 'One lecture' }))
  await waitFor(() => expect(api.uploadPhotos).toHaveBeenCalledWith(2, 'Board', [a, b]))
  expect(api.upload).not.toHaveBeenCalled()
})
