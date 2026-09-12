import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi, type MockInstance } from 'vitest'
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

/* jsdom lays nothing out, so each link reports the box it would have: Courses first,
   Evaluation after it. Anything else, the pill included, has no box */
const spies: MockInstance[] = []
function layOutLinks() {
  const box = (el: HTMLElement) =>
    el.textContent === 'Courses' ? { x: 3, y: 3, w: 80, h: 36 }
    : el.textContent === 'Evaluation' ? { x: 87, y: 3, w: 96, h: 36 }
    : { x: 0, y: 0, w: 0, h: 0 }
  spies.push(
    vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) { return box(this).x }),
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) { return box(this).y }),
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) { return box(this).w }),
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return box(this).h }),
  )
}

afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore()
})

const pillAt = () => {
  const pill = document.querySelector<HTMLElement>('.nav-pill')!
  return { x: pill.style.getPropertyValue('--pill-x'), w: pill.style.getPropertyValue('--pill-w') }
}

test('the pill sits under the current link', async () => {
  layOutLinks()
  at('/eval')
  expect(pillAt()).toEqual({ x: '87px', w: '96px' })
  await screen.findByText('31 labeled')
})

test('switching segments in one nav moves its pill to the new link', async () => {
  layOutLinks()
  at('/courses/2/study')
  await screen.findByText('31 labeled')
  expect(pillAt()).toEqual({ x: '3px', w: '80px' })
  await userEvent.click(screen.getByRole('link', { name: 'Evaluation' }))
  expect(pillAt()).toEqual({ x: '87px', w: '96px' })
})

/* home and the other pages each mount their own nav, so the slide between them has to
   start in the new nav, under the segment the old one had current */
test('a nav mounted after a switch draws its pill under the old segment first, then slides', async () => {
  layOutLinks()
  const home = at('/')
  await screen.findByText('31 labeled')
  home.unmount()

  const drawnAt: string[] = []
  const setProperty = CSSStyleDeclaration.prototype.setProperty
  spies.push(vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty').mockImplementation(
    function (this: CSSStyleDeclaration, name, value, priority) {
      if (name === '--pill-x') drawnAt.push(String(value))
      setProperty.call(this, name, value, priority)
    }))
  at('/eval')
  expect(drawnAt).toEqual(['3px', '87px'])
  await screen.findByText('31 labeled')
})

test('a nav mounted on the segment that was already current does not slide', async () => {
  layOutLinks()
  const first = at('/courses/2/study')
  await screen.findByText('31 labeled')
  first.unmount()

  const drawnAt: string[] = []
  const setProperty = CSSStyleDeclaration.prototype.setProperty
  spies.push(vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty').mockImplementation(
    function (this: CSSStyleDeclaration, name, value, priority) {
      if (name === '--pill-x') drawnAt.push(String(value))
      setProperty.call(this, name, value, priority)
    }))
  at('/')
  // drawn under Courses and left there: the pill never moves, so nothing slides
  expect([...new Set(drawnAt)]).toEqual(['3px'])
  await screen.findByText('31 labeled')
})
