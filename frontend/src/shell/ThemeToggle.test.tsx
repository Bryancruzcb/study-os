import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setThemeChoice } from '../theme'
import ThemeToggle from './ThemeToggle'

afterEach(() => setThemeChoice(null))

test('the toggle names the theme it switches to, and switches', async () => {
  render(<ThemeToggle />)
  await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
  expect(document.documentElement.dataset.theme).toBe('dark')
  await userEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }))
  expect(document.documentElement.dataset.theme).toBe('light')
})
