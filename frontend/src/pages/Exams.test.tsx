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

test('an exam ahead shows what today holds for it and where its plan stands', async () => {
  vi.mocked(api.exams).mockResolvedValue([midterm])
  renderExams()
  expect(await screen.findByRole('heading', { name: 'Midterm' })).toBeInTheDocument()
  expect(screen.getByText('Sat, Sep 26 · in 14 days')).toBeInTheDocument()
  expect(screen.getByText('Today: 2 new topics and 5 reviews')).toBeInTheDocument()
  expect(screen.getByText('4 of 22 topics started. New topics through Tue, Sep 22, then 3 days of review. Covers 2 lectures.'))
    .toBeInTheDocument()
})

test('the plan reads right on its last day, on the exam day, and after', async () => {
  vi.mocked(api.exams).mockResolvedValue([
    { ...midterm, id: 5, name: 'Quiz', plan: { ...midterm.plan!, daysLeft: 1, reviewDays: 0, topicsLeft: 0, newToday: 0, reviewsToday: 0 } },
    { ...midterm, id: 6, name: 'Lab exam', status: 'today', plan: null },
    { ...midterm, id: 7, name: 'Pop quiz', status: 'past', plan: null },
  ])
  renderExams()
  expect(await screen.findByText('Sat, Sep 26 · tomorrow')).toBeInTheDocument()
  expect(screen.getByText('Nothing due for this exam today')).toBeInTheDocument()
  expect(screen.getByText(/^Every topic is started/)).toBeInTheDocument()
  expect(screen.getByText('The exam is today.')).toBeInTheDocument()
  expect(screen.getByText('This exam has passed.')).toBeInTheDocument()
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

test('closing the form hands the caret to the heading', async () => {
  renderExams()
  await userEvent.click(await screen.findByRole('button', { name: 'Add an exam' }))
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('heading', { name: 'Exams' })).toHaveFocus()
})
