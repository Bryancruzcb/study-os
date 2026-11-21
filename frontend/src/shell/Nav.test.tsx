import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { api } from '../api'
import { getUser, setUser } from '../auth'
import Nav from './Nav'

vi.mock('../api', () => ({
  api: {
    auth: { logout: vi.fn().mockResolvedValue(undefined) },
  },
}))

const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><Nav /></MemoryRouter>)

test('inside a course, Courses is the current page and says so to assistive tech', () => {
  at('/courses/2/study')
  const courses = screen.getByRole('link', { name: 'Courses' })
  expect(courses).toHaveClass('is-current')
  expect(courses).toHaveAttribute('aria-current', 'page')
  expect(courses).toHaveAttribute('href', '/')
})

test('Courses is the only place in the bar, with no Evaluation beside it', () => {
  at('/')
  expect(screen.getAllByRole('link')).toHaveLength(1)
  expect(screen.queryByRole('link', { name: 'Evaluation' })).not.toBeInTheDocument()
})

test('the signed-in account is named in the bar and can sign out from it', async () => {
  setUser('bryan')
  at('/courses/2/study')
  expect(screen.getByText('bryan')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(api.auth.logout).toHaveBeenCalled()
  await waitFor(() => expect(getUser()).toBeNull())
  expect(screen.queryByText('bryan')).not.toBeInTheDocument()
})

test('signed out, the bar names nobody', () => {
  setUser(null)
  at('/')
  expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
})

test('the bar carries no evaluation figures', () => {
  at('/')
  expect(screen.queryByText(/labeled|graded|agreement/)).not.toBeInTheDocument()
})
