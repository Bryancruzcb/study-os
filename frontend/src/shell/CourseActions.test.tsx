import { render, screen, waitFor } from '@testing-library/react'
import { SERVER_PROBLEM } from '../errors'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { api } from '../api'
import CourseActions, { CourseMenu } from './CourseActions'

vi.mock('../api', () => ({
  api: {
    setArchived: vi.fn(),
    deleteCourse: vi.fn(),
    updateCourse: vi.fn(),
  },
}))

const course = { id: 2, name: 'CS 149', term: 'Fall 2026', concepts: 248, questions: 844, dueToday: 16, archived: false }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.setArchived).mockResolvedValue(undefined)
  vi.mocked(api.deleteCourse).mockResolvedValue(undefined)
  vi.mocked(api.updateCourse).mockResolvedValue(undefined)
})

function renderMenu(over: Partial<typeof course> = {}) {
  const onArchived = vi.fn()
  const onDeleted = vi.fn()
  const onEdited = vi.fn()
  render(
    <>
      <CourseMenu course={{ ...course, ...over }} onArchived={onArchived} onDeleted={onDeleted} onEdited={onEdited} />
      <button type="button">after the menu</button>
    </>,
  )
  return { onArchived, onDeleted, onEdited, options: screen.getByRole('button', { name: 'Course options' }) }
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
  expect(screen.getByRole('button', { name: 'Edit course' })).toHaveFocus()
  await userEvent.tab()
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
  vi.mocked(api.setArchived).mockRejectedValueOnce(new Error(SERVER_PROBLEM))
  const { onArchived, options } = renderMenu()
  await userEvent.click(options)
  await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(SERVER_PROBLEM)
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

test('Edit course swaps the list for the name and term, filled in, with the caret on the name', async () => {
  const { options } = renderMenu()
  await userEvent.click(options)
  await userEvent.click(screen.getByRole('button', { name: 'Edit course' }))
  expect(screen.getByRole('form', { name: 'Edit course' })).toBeInTheDocument()
  expect(screen.getByLabelText('Name')).toHaveValue('CS 149')
  expect(screen.getByLabelText('Name')).toHaveFocus()
  expect(screen.getByLabelText('Term')).toHaveValue('Fall 2026')
  expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
})

test('Save sends the new name and term trimmed, hands it on and closes', async () => {
  const { onEdited, options } = renderMenu()
  await userEvent.click(options)
  await userEvent.click(screen.getByRole('button', { name: 'Edit course' }))
  await userEvent.clear(screen.getByLabelText('Name'))
  await userEvent.type(screen.getByLabelText('Name'), '  Operating Systems ')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(api.updateCourse).toHaveBeenCalledWith(2, 'Operating Systems', 'Fall 2026')
  expect(onEdited).toHaveBeenCalled()
  await waitFor(() => expect(options).toHaveAttribute('aria-expanded', 'false'))
  expect(options).toHaveFocus()
})

test('a blank name or term cannot be saved', async () => {
  const { options } = renderMenu()
  await userEvent.click(options)
  await userEvent.click(screen.getByRole('button', { name: 'Edit course' }))
  await userEvent.clear(screen.getByLabelText('Term'))
  await userEvent.type(screen.getByLabelText('Term'), '   ')
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  await userEvent.keyboard('{Enter}')
  expect(api.updateCourse).not.toHaveBeenCalled()
})

test('saving with nothing changed closes without a call', async () => {
  const { onEdited, options } = renderMenu()
  await userEvent.click(options)
  await userEvent.click(screen.getByRole('button', { name: 'Edit course' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(api.updateCourse).not.toHaveBeenCalled()
  expect(onEdited).not.toHaveBeenCalled()
  expect(options).toHaveAttribute('aria-expanded', 'false')
})

test('Cancel drops the edit and puts the caret back on Edit course', async () => {
  const { options } = renderMenu()
  await userEvent.click(options)
  await userEvent.click(screen.getByRole('button', { name: 'Edit course' }))
  await userEvent.type(screen.getByLabelText('Name'), ' draft')
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'Edit course' })).toHaveFocus()
  // opening the fields again starts from the course, not from the dropped draft
  await userEvent.click(screen.getByRole('button', { name: 'Edit course' }))
  expect(screen.getByLabelText('Name')).toHaveValue('CS 149')
  expect(api.updateCourse).not.toHaveBeenCalled()
})

test('a failed save stays open with the alert and keeps what was typed', async () => {
  vi.mocked(api.updateCourse).mockRejectedValueOnce(new Error('A course needs a name and a term.'))
  const { onEdited, options } = renderMenu()
  await userEvent.click(options)
  await userEvent.click(screen.getByRole('button', { name: 'Edit course' }))
  await userEvent.type(screen.getByLabelText('Name'), ' A')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('A course needs a name and a term.')
  expect(screen.getByLabelText('Name')).toHaveValue('CS 149 A')
  expect(onEdited).not.toHaveBeenCalled()
  // the field that held the caret was disabled for the call; the caret comes back to the name
  await waitFor(() => expect(screen.getByLabelText('Name')).toHaveFocus())
})

test('the alert from a failed save goes with the edit when it is cancelled', async () => {
  vi.mocked(api.updateCourse).mockRejectedValueOnce(new Error('A course needs a name and a term.'))
  const { options } = renderMenu()
  await userEvent.click(options)
  await userEvent.click(screen.getByRole('button', { name: 'Edit course' }))
  await userEvent.type(screen.getByLabelText('Name'), ' A')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByRole('alert')
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('Escape while editing closes the menu, drops the edit and hands the caret back', async () => {
  const { options } = renderMenu()
  await userEvent.click(options)
  await userEvent.click(screen.getByRole('button', { name: 'Edit course' }))
  await userEvent.type(screen.getByLabelText('Name'), ' draft')
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  expect(options).toHaveAttribute('aria-expanded', 'false')
  expect(options).toHaveFocus()
  expect(api.updateCourse).not.toHaveBeenCalled()
})
