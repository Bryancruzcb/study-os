import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getAccessCode, markLocked, setAccessCode } from '../access'
import AccessGate from './AccessGate'

// the lock is module state, so every test starts from an unlocked app
beforeEach(() => setAccessCode(''))

test('the pages stay up until the backend asks for a code', () => {
  render(<AccessGate><p>the pages</p></AccessGate>)
  expect(screen.getByText('the pages')).toBeInTheDocument()

  act(() => markLocked())
  expect(screen.queryByText('the pages')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Access code')).toBeInTheDocument()
})

test('a code brings the pages back, and one the backend turns away says so', async () => {
  const user = userEvent.setup()
  render(<AccessGate><p>the pages</p></AccessGate>)
  act(() => markLocked())
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()

  await user.type(screen.getByLabelText('Access code'), 'guess')
  await user.click(screen.getByRole('button', { name: 'Unlock' }))
  expect(getAccessCode()).toBe('guess')
  expect(screen.getByText('the pages')).toBeInTheDocument()

  act(() => markLocked())
  expect(screen.getByRole('alert')).toHaveTextContent('That code was not accepted.')
})
