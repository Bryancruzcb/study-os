import { act, render, screen } from '@testing-library/react'
import Loading, { SkLine, SKELETON_DELAY_MS } from './Loading'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const skeletons = (root: HTMLElement) => root.querySelectorAll('.skeleton').length

test('says what is loading to screen readers from the first moment', () => {
  render(<Loading what="the quiz"><SkLine /></Loading>)
  expect(screen.getByText('Loading the quiz…')).toHaveClass('visually-hidden')
  expect(screen.getByText('Loading the quiz…').parentElement).toHaveAttribute('aria-busy', 'true')
})

test('shows no skeleton when the load is quick, so fast loads never flash one', () => {
  const { container } = render(<Loading what="courses"><SkLine /></Loading>)
  act(() => { vi.advanceTimersByTime(SKELETON_DELAY_MS - 1) })
  expect(skeletons(container)).toBe(0)
})

test('shows the skeleton once the wait outlasts the delay', () => {
  const { container } = render(<Loading what="courses"><SkLine /></Loading>)
  act(() => { vi.advanceTimersByTime(SKELETON_DELAY_MS) })
  expect(skeletons(container)).toBe(1)
})
