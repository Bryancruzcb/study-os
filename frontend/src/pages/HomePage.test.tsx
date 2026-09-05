import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { api, type Course } from '../api'
import HomePage, { dueSplit } from './HomePage'

const overview = [
  { id: 1, name: 'CS 47', term: 'Spring 2026', concepts: 18, questions: 55, dueToday: 11 },
  { id: 2, name: 'CS 149', term: 'Fall 2026', concepts: 248, questions: 844, dueToday: 16 },
]

vi.mock('../api', () => ({
  api: {
    overview: vi.fn(),
    createCourse: vi.fn(),
    evalReport: vi.fn().mockResolvedValue({
      labeled: 31, pctAnswerable: 1, pctCorrectAnswer: 0.97, pctUnambiguous: 0.94,
      gradedShortAnswers: 1, graderAgreement: 1,
    }),
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
  )
}

test('dueSplit names every course', () => {
  expect(dueSplit([])).toBe('')
  expect(dueSplit([overview[0]])).toBe('11 in CS 47')
  expect(dueSplit(overview)).toBe('11 in CS 47 and 16 in CS 149')
  expect(dueSplit([...overview, { id: 3, name: 'CS 158A', term: 'Fall 2026', concepts: 39, questions: 139, dueToday: 16 }]))
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
  vi.mocked(api.overview).mockRejectedValueOnce(new Error('500 /api/courses/overview'))
  renderHome()
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/courses/overview')
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
  land({ id: 3, name: 'CS 158A', term: 'Fall 2026' })
  expect(await screen.findByText('at /courses/3/bank')).toBeInTheDocument()
})

test('a failed create shows the alert and leaves the form open with what was typed', async () => {
  vi.mocked(api.createCourse).mockRejectedValueOnce(new Error('500 /api/courses'))
  renderHome()
  await userEvent.click(await screen.findByRole('button', { name: 'New course' }))
  await userEvent.type(screen.getByLabelText('Name'), 'CS 158A')
  await userEvent.click(screen.getByRole('button', { name: 'Create' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/courses')
  expect(screen.getByLabelText('Name')).toHaveValue('CS 158A')
  expect(screen.getByLabelText('Term')).toHaveValue('Fall 2026')
})

test('cancelling hands the caret back to the new-course tile', async () => {
  renderHome()
  const open = await screen.findByRole('button', { name: 'New course' })
  await userEvent.click(open)
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'New course' })).toHaveFocus()
})
