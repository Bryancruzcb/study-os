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

test('three or more slides in a row read as a range, and shorter runs stay listed', () => {
  expect(slides('20,21,22,23,24,26,27,54,55')).toBe('slides 20–24, 26, 27, 54, 55')
  expect(slides('10,11,12,13')).toBe('slides 10–13')
  expect(slides('38,39,40,41,63,64')).toBe('slides 38–41, 63, 64')
  // the order they were stored in is kept, so a descending pair is not a run
  expect(slides('5,4,3')).toBe('slides 5, 4, 3')
})
