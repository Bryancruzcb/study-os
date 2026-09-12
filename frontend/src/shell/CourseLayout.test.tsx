import { useState, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Navigate, Route, Routes, useOutletContext } from 'react-router-dom'
import { vi } from 'vitest'
import { api } from '../api'
import CourseLayout, { type CourseContext } from './CourseLayout'

vi.mock('../api', () => ({
  api: {
    overview: vi.fn().mockResolvedValue([
      { id: 2, name: 'CS 149', term: 'Fall 2026', concepts: 248, questions: 844, dueToday: 16 },
    ]),
  },
}))

function renderAt(path: string, study: ReactNode = <p>study page</p>) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/courses/:courseId" element={<CourseLayout />}>
          <Route index element={<Navigate to="study" replace />} />
          <Route path="study" element={study} />
          <Route path="bank" element={<p>bank page</p>} />
        </Route>
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

test('a known course gets its head and tabs, and the index route lands on study', async () => {
  renderAt('/courses/2')
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('CS 149')
  expect(screen.getByText('Fall 2026 · 248 concepts · 844 questions')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Study' })).toHaveAttribute('href', '/courses/2/study')
  expect(screen.getByRole('link', { name: 'Bank' })).toHaveAttribute('href', '/courses/2/bank')
  expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/courses/2/dashboard')
  expect(screen.getByRole('link', { name: '← All courses' })).toHaveAttribute('href', '/')
  expect(await screen.findByText('study page')).toBeInTheDocument()
})

test('the current tab is marked', async () => {
  renderAt('/courses/2/bank')
  await screen.findByText('bank page')
  expect(screen.getByRole('link', { name: 'Bank' })).toHaveClass('is-current')
  expect(screen.getByRole('link', { name: 'Study' })).not.toHaveClass('is-current')
})

test('an unknown id is a not-found state with a way back', async () => {
  renderAt('/courses/99/study')
  expect(await screen.findByRole('alert')).toHaveTextContent('No course has id 99.')
  expect(screen.getByRole('link', { name: 'All courses' })).toHaveAttribute('href', '/')
  expect(screen.queryByText('study page')).not.toBeInTheDocument()
})

test('a non-numeric id is a not-found state too', async () => {
  renderAt('/courses/abc/study')
  expect(await screen.findByRole('alert')).toHaveTextContent('No course has id abc.')
})

test('a failed overview shows the alert instead of the tabs', async () => {
  vi.mocked(api.overview).mockRejectedValueOnce(new Error('500 /api/courses/overview'))
  renderAt('/courses/2/study')
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/courses/overview')
  expect(screen.queryByRole('link', { name: 'Study' })).not.toBeInTheDocument()
})

/* Keeps the course it mounted with, the way the Study page keeps its start-of-visit
   figure; a stale name here means the page outlived a course switch. */
function Probe() {
  const { course } = useOutletContext<CourseContext>()
  const [startedOn] = useState(course.name)
  return (
    <>
      <p>started on {startedOn}</p>
      <Link to="/courses/3/study">switch to CS 158A</Link>
    </>
  )
}

test('a course switch starts the page over', async () => {
  vi.mocked(api.overview).mockResolvedValueOnce([
    { id: 2, name: 'CS 149', term: 'Fall 2026', concepts: 248, questions: 844, dueToday: 16 },
    { id: 3, name: 'CS 158A', term: 'Fall 2026', concepts: 39, questions: 139, dueToday: 16 },
  ])
  renderAt('/courses/2/study', <Probe />)
  expect(await screen.findByText('started on CS 149')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'switch to CS 158A' }))
  // the head follows the route on its own; only a keyed outlet makes the page start over
  expect(await screen.findByRole('heading', { level: 1, name: 'CS 158A' })).toBeInTheDocument()
  expect(screen.getByText('started on CS 158A')).toBeInTheDocument()
})

test('the head reads a count of one as singular', async () => {
  vi.mocked(api.overview).mockResolvedValueOnce([
    { id: 2, name: 'CS 149', term: 'Fall 2026', concepts: 1, questions: 1, dueToday: 0 },
  ])
  renderAt('/courses/2/study')
  expect(await screen.findByText('Fall 2026 · 1 concept · 1 question')).toBeInTheDocument()
})
