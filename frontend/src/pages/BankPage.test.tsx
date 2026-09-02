import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import BankPage from './BankPage'

vi.mock('../api', () => ({
  api: {
    courses: vi.fn().mockResolvedValue([{ id: 1, name: 'CS 158A', term: 'Fall 2026' }]),
    bank: vi.fn().mockResolvedValue([
      {
        id: 5, name: 'TCP handshake', summary: 'SYN/SYN-ACK/ACK', sourcePages: '3,4',
        questions: [
          { id: 9, type: 'MC', prompt: 'Steps?', optionsJson: '["1","2","3","4"]', correctIndex: 2, sourcePages: '3', status: 'ACTIVE' },
        ],
      },
    ]),
    upload: vi.fn(),
    retire: vi.fn(),
    createCourse: vi.fn(),
  },
}))

test('renders concepts with questions and page citations', async () => {
  render(<BankPage />)
  await waitFor(() => expect(screen.getByText('TCP handshake')).toBeInTheDocument())
  expect(screen.getByText(/pp\. 3,4/)).toBeInTheDocument()
  expect(screen.getByText('Steps?')).toBeInTheDocument()
})
