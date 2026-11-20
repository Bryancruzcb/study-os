import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { api } from '../api'
import CourseActions, { CourseMenu } from './CourseActions'

vi.mock('../api', () => ({
  api: {
    setArchived: vi.fn(),
    deleteCourse: vi.fn(),
  },
}))

const course = { id: 2, name: 'CS 149', term: 'Fall 2026', concepts: 248, questions: 844, dueToday: 16, archived: false }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.setArchived).mockResolvedValue(undefined)
  vi.mocked(api.deleteCourse).mockResolvedValue(undefined)
})

function renderMenu(over: Partial<typeof course> = {}) {
  const onArchived = vi.fn()
  const onDeleted = vi.fn()
  render(
    <>
      <CourseMenu course={{ ...course, ...over }} onArchived={onArchived} onDeleted={onDeleted} />
      <button type="button">after the menu</button>
    </>,
  )
  return { onArchived, onDeleted, options: screen.getByRole('button', { name: 'Course options' }) }
}

test('the menu starts closed and says so', () => {
  const { options } = renderMenu()
  expect(options).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
})

test('Enter opens it with the caret on the first action, and Tab reaches the next', async () => {
  const { options } = renderMenu()
  options.focus()
  await userEvent.keyboard('{Enter}')
  expect(options).toHaveAttribute('aria-expanded', 'true')
  expect(options).toHaveAttribute('aria-controls', document.querySelector('.course-menu-panel')!.id)
  expect(screen.getByRole('button', { name: 'Archive' })).toHaveFocus()
  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'Delete course' })).toHaveFocus()
})

test('Escape closes it and hands the caret back to the button', async () => {
  const { options } = renderMenu()
  await userEvent.click(options)
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
  expect(options).toHaveAttribute('aria-expanded', 'false')
  expect(options).toHaveFocus()
})

test('a click outside closes it', async () => {
  const { options } = renderMenu()
  await userEvent.click(options)
  await userEvent.click(document.body)
  expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
  expect(options).toHaveAttribute('aria-expanded', 'false')
})

test('a Tab past the last action closes it', async () => {
  const { options } = renderMenu()
  await userEvent.click(options)
  await userEvent.tab()
  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'after the menu' })).toHaveFocus()
  expect(options).toHaveAttribute('aria-expanded', 'false')
})

test('Archive archives the course and hands the result on', async () => {
  const { onArchived, options } = renderMenu()
  await userEvent.click(options)
  await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
  expect(api.setArchived).toHaveBeenCalledWith(2, true)
  expect(onArchived).toHaveBeenCalledWith(true)
})

test('an archived course offers Restore, and the menu closes behind it', async () => {
  const { onArchived, options } = renderMenu({ archived: true })
  await userEvent.click(options)
  await userEvent.click(screen.getByRole('button', { name: 'Restore' }))
  expect(api.setArchived).toHaveBeenCalledWith(2, false)
  expect(onArchived).toHaveBeenCalledWith(false)
  await waitFor(() => expect(options).toHaveAttribute('aria-expanded', 'false'))
  expect(options).toHaveFocus()
})

test('Delete course arms first, with the caret on Cancel, and Cancel goes back to Delete course', async () => {
  const { onDeleted, options } = renderMenu()
  await userEvent.click(options)
  await userEvent.click(screen.getByRole('button', { name: 'Delete course' }))
  expect(screen.getByText("Delete CS 149 and its 844 questions? This can't be undone.")).toBeInTheDocument()
  // a held Enter lands on Cancel, never on the delete
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  expect(api.deleteCourse).not.toHaveBeenCalled()
  expect(onDeleted).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Delete course' })).toHaveFocus()
})

test('Delete forever deletes the course and hands it on', async () => {
  const { onDeleted, options } = renderMenu()
  await userEvent.click(options)
  await userEvent.click(screen.getByRole('button', { name: 'Delete course' }))
  await userEvent.click(screen.getByRole('button', { name: 'Delete forever' }))
  expect(api.deleteCourse).toHaveBeenCalledWith(2)
  expect(onDeleted).toHaveBeenCalled()
})

test('a failed archive stays open with the alert, so it can be tried again', async () => {
  vi.mocked(api.setArchived).mockRejectedValueOnce(new Error('500 /api/courses/2/archived'))
  const { onArchived, options } = renderMenu()
  await userEvent.click(options)
  await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/courses/2/archived')
  expect(onArchived).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Archive' })).toBeEnabled()
})

test('the row form, on the home page, keeps its actions in view and arms Delete the same way', async () => {
  const onDeleted = vi.fn()
  render(<CourseActions course={{ ...course, archived: true }} onArchived={vi.fn()} onDeleted={onDeleted} />)
  expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Delete course' }))
  await userEvent.click(screen.getByRole('button', { name: 'Delete forever' }))
  expect(api.deleteCourse).toHaveBeenCalledWith(2)
  expect(onDeleted).toHaveBeenCalled()
})
