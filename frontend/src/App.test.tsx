import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import App from './App'

vi.mock('./api', () => ({
  api: {
    courses: vi.fn().mockResolvedValue([]),
    bank: vi.fn().mockResolvedValue([]),
    upload: vi.fn(),
    retire: vi.fn(),
    createCourse: vi.fn(),
  },
}))

test('renders app title', () => {
  render(<App />)
  expect(screen.getByText('Study OS')).toBeInTheDocument()
})
