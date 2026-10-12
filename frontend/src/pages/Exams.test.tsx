import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { api, type Exam, type Lecture } from '../api'
import { dayLabel } from '../dates'
import Exams from './Exams'

vi.mock('../api', () => ({
  api: { exams: vi.fn(), lectures: vi.fn(), createExam: vi.fn(), updateExam: vi.fn(), deleteExam: vi.fn() },
}))

const lectures: Lecture[] = [
  { id: 11, filename: 'Lecture 1.pdf', concepts: 9 },
  { id: 12, filename: 'Lecture 2.pdf', concepts: 13 },
  { id: 13, filename: 'Lecture 3.pdf', concepts: 7 },
]

const midterm: Exam = {
  id: 4, name: 'Midterm', date: '2026-09-26', lectureIds: [11, 12], status: 'upcoming',
  plan: { daysLeft: 14, reviewDays: 3, lastNewDay: '2026-09-22', topics: 22, topicsLeft: 18, newToday: 2, reviewsToday: 5 },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.exams).mockResolvedValue([])
  vi.mocked(api.lectures).mockResolvedValue(lectures)
  vi.mocked(api.createExam).mockResolvedValue(midterm)
  vi.mocked(api.updateExam).mockResolvedValue(midterm)
  vi.mocked(api.deleteExam).mockResolvedValue(undefined)
})

function renderExams() {
  const onChange = vi.fn()
  render(<Exams courseId={1} onChange={onChange} />)
  return onChange
}

const nameField = () => screen.getByRole('textbox', { name: 'Name' })
const dateField = () => screen.getByLabelText('Date')
const lectureBox = (filename: string) => screen.getByRole('checkbox', { name: new RegExp(filename) })

test('dates are spelled out the same in every locale and timezone', () => {
  expect(dayLabel('2026-09-26')).toBe('Sat, Sep 26')
  expect(dayLabel('2026-12-01')).toBe('Tue, Dec 1')
})

test('with no exams, it says what adding one does and offers to', async () => {
  renderExams()
  expect(await screen.findByText(/paced to its date/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add an exam' })).toBeInTheDocument()
})

test('the nearest exam leads: when it is, what today holds for it, and how its plan runs', async () => {
  vi.mocked(api.exams).mockResolvedValue([midterm])
  renderExams()
  expect(await screen.findByRole('heading', { name: 'Today: 2 new topics and 5 reviews.' })).toBeInTheDocument()
  expect(screen.getByText('Midterm')).toBeInTheDocument()
  expect(screen.getByText('Sat, Sep 26 · in 14 days')).toBeInTheDocument()
  // it covers two of the three lectures, so it says how much of its own material is started
  expect(screen.getByText('New topics run through Tue, Sep 22, then 3 days of review before the exam. It covers 2 lectures. 4 of its 22 topics started.'))
    .toBeInTheDocument()
})

test('the due count is only said to add up when it does', async () => {
  vi.mocked(api.exams).mockResolvedValue([{ ...midterm, lectureIds: [11, 12, 13] }])
  const { rerender } = render(<Exams courseId={1} onChange={() => {}} dueToday={7} />)
  expect(await screen.findByText(/^That makes/)).toHaveTextContent(
    'That makes 7 due today. New topics run through Tue, Sep 22, then 3 days of review before the exam. It covers all 3 lectures.')
  rerender(<Exams courseId={1} onChange={() => {}} dueToday={9} />)
  expect(screen.getByText(/across the course/)).toHaveTextContent('9 due today across the course.')
  expect(screen.queryByText(/^That makes/)).not.toBeInTheDocument()
})

test('the plan reads right on its last day, on the exam day, and after', async () => {
  vi.mocked(api.exams).mockResolvedValue([
    { ...midterm, id: 5, name: 'Quiz', plan: { ...midterm.plan!, daysLeft: 1, reviewDays: 0, topicsLeft: 0, newToday: 0, reviewsToday: 0 } },
    { ...midterm, id: 6, name: 'Lab exam', status: 'today', plan: null },
    { ...midterm, id: 7, name: 'Pop quiz', status: 'past', plan: null },
  ])
  renderExams()
  expect(await screen.findByText('Sat, Sep 26 · tomorrow')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Nothing due for this exam today.' })).toBeInTheDocument()
  expect(screen.getByText(/^Every topic is started/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Other exams' })).toBeInTheDocument()
  expect(screen.getByText('The exam is today.')).toBeInTheDocument()
  expect(screen.getByText('This exam has passed.')).toBeInTheDocument()
})

test('with only past exams, none leads and the page asks for the next one', async () => {
  vi.mocked(api.exams).mockResolvedValue([{ ...midterm, status: 'past', plan: null }])
  render(<Exams courseId={1} onChange={() => {}} dueToday={3} />)
  expect(await screen.findByRole('heading', { name: '3 due today.' })).toBeInTheDocument()
  expect(screen.getByText('No exam ahead')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Past exams' })).toBeInTheDocument()
  expect(screen.getByText(/^Every exam here has passed/)).toBeInTheDocument()
})

test('a course with nothing in it says so, and until that is known the head is a skeleton', async () => {
  const { rerender } = render(<Exams courseId={1} onChange={() => {}} empty={null} />)
  expect(document.querySelector('.plan[aria-busy="true"]')).toBeInTheDocument()
  rerender(<Exams courseId={1} onChange={() => {}} empty />)
  expect(await screen.findByRole('heading', { name: 'No concepts yet.' })).toBeInTheDocument()
  expect(screen.getByText(/^Upload a lecture PDF in the bank/)).toBeInTheDocument()
})

test('adding an exam starts with the lectures no exam covers yet, and saves what was picked', async () => {
  vi.mocked(api.exams).mockResolvedValueOnce([{ ...midterm, lectureIds: [11] }]).mockResolvedValue([midterm])
  const onChange = renderExams()
  await userEvent.click(await screen.findByRole('button', { name: 'Add an exam' }))
  expect(nameField()).toHaveFocus()
  expect(lectureBox('Lecture 1.pdf')).not.toBeChecked()
  expect(lectureBox('Lecture 2.pdf')).toBeChecked()
  expect(lectureBox('Lecture 3.pdf')).toBeChecked()

  await userEvent.type(nameField(), 'Final')
  fireEvent.change(dateField(), { target: { value: '2026-12-10' } })
  await userEvent.click(lectureBox('Lecture 3.pdf'))
  await userEvent.click(screen.getByRole('button', { name: 'Save exam' }))

  await waitFor(() => expect(api.createExam).toHaveBeenCalledWith(1, { name: 'Final', date: '2026-12-10', lectureIds: [12] }))
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('button', { name: 'Save exam' })).not.toBeInTheDocument()
})

test('Save waits for a name, a date and at least one lecture', async () => {
  renderExams()
  await userEvent.click(await screen.findByRole('button', { name: 'Add an exam' }))
  const save = screen.getByRole('button', { name: 'Save exam' })
  expect(save).toBeDisabled()
  await userEvent.type(nameField(), 'Midterm')
  expect(save).toBeDisabled()
  fireEvent.change(dateField(), { target: { value: '2026-09-26' } })
  expect(save).toBeEnabled()
  for (const box of screen.getAllByRole('checkbox')) await userEvent.click(box)
  expect(save).toBeDisabled()
})

test('editing an exam saves its new date, and deleting one asks first', async () => {
  vi.mocked(api.exams).mockResolvedValue([midterm])
  const onChange = renderExams()
  await userEvent.click(await screen.findByRole('button', { name: 'Edit Midterm' }))
  expect(nameField()).toHaveValue('Midterm')
  fireEvent.change(dateField(), { target: { value: '2026-09-29' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save exam' }))
  await waitFor(() => expect(api.updateExam).toHaveBeenCalledWith(4, { name: 'Midterm', date: '2026-09-29', lectureIds: [11, 12] }))
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))

  await userEvent.click(await screen.findByRole('button', { name: 'Edit Midterm' }))
  await userEvent.click(screen.getByRole('button', { name: 'Delete exam' }))
  expect(api.deleteExam).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
  await waitFor(() => expect(api.deleteExam).toHaveBeenCalledWith(4))
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))
})

test('a failed save keeps the form and what was typed', async () => {
  vi.mocked(api.createExam).mockRejectedValueOnce(new Error('500 /api/courses/1/exams'))
  renderExams()
  await userEvent.click(await screen.findByRole('button', { name: 'Add an exam' }))
  await userEvent.type(nameField(), 'Midterm')
  fireEvent.change(dateField(), { target: { value: '2026-09-26' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save exam' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/courses/1/exams')
  expect(nameField()).toHaveValue('Midterm')
  expect(screen.getByRole('button', { name: 'Save exam' })).toBeEnabled()
})

test('closing the form hands the caret to the headline', async () => {
  renderExams()
  await userEvent.click(await screen.findByRole('button', { name: 'Add an exam' }))
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('heading', { name: 'Nothing due today.' })).toHaveFocus()
})
