import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import Nav from './Nav'

vi.mock('../api', () => ({
  api: {
    evalReport: vi.fn().mockResolvedValue({
      labeled: 31, pctAnswerable: 1, pctCorrectAnswer: 0.97, pctUnambiguous: 0.94,
      gradedShortAnswers: 1, graderAgreement: 1,
    }),
  },
}))

const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><Nav /></MemoryRouter>)

test('inside a course, Courses is the current page and says so to assistive tech', async () => {
  at('/courses/2/study')
  const courses = screen.getByRole('link', { name: 'Courses' })
  expect(courses).toHaveClass('is-current')
  expect(courses).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Evaluation' })).not.toHaveAttribute('aria-current')
  await screen.findByText('31 labeled')
})

test('on the evaluation page it is the other way round', async () => {
  at('/eval')
  const evaluation = screen.getByRole('link', { name: 'Evaluation' })
  expect(evaluation).toHaveClass('is-current')
  expect(evaluation).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Courses' })).not.toHaveClass('is-current')
  expect(screen.getByRole('link', { name: 'Courses' })).not.toHaveAttribute('aria-current')
  await screen.findByText('31 labeled')
})
