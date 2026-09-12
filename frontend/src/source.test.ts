import { citation, slides } from './source'

test('one page is a slide, several are slides', () => {
  expect(slides('40')).toBe('slide 40')
  expect(slides('40,41')).toBe('slides 40, 41')
})

test('a citation names the lecture, then the slides, and leaves out whatever is missing', () => {
  expect(citation('Lecture 3.pdf', '40,41')).toBe('Lecture 3.pdf · slides 40, 41')
  expect(citation('Lecture 3.pdf', null)).toBe('Lecture 3.pdf')
  expect(citation(null, '7')).toBe('slide 7')
  expect(citation(null, null)).toBeNull()
})
