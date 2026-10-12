import { effectiveTheme, getThemeChoice, setThemeChoice, THEME_KEY, toggled } from './theme'

afterEach(() => setThemeChoice(null))

test('the system decides until a theme is picked, and a pick wins over the system', () => {
  expect(effectiveTheme(null, false)).toBe('light')
  expect(effectiveTheme(null, true)).toBe('dark')
  expect(effectiveTheme('light', true)).toBe('light')
  expect(effectiveTheme('dark', false)).toBe('dark')
})

test('the toggle lands on the other theme from the one on screen', () => {
  expect(toggled(null, false)).toBe('dark')
  expect(toggled(null, true)).toBe('light')
  expect(toggled('dark', false)).toBe('light')
})

test('a pick goes on the page and into storage, and clearing it takes both off', () => {
  setThemeChoice('dark')
  expect(getThemeChoice()).toBe('dark')
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(localStorage.getItem(THEME_KEY)).toBe('dark')
  setThemeChoice(null)
  expect(document.documentElement.dataset.theme).toBeUndefined()
  expect(localStorage.getItem(THEME_KEY)).toBeNull()
})
