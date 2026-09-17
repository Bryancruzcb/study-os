import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { api } from '../api'
import { clearInvite, getInvite, getUser, markSignedOut, setUser, takeInviteFromLink } from '../auth'
import AuthGate from './AuthGate'

vi.mock('../api', () => ({
  api: {
    auth: {
      me: vi.fn(),
      config: vi.fn(),
      login: vi.fn(),
      signup: vi.fn(),
      forgotPassword: vi.fn(),
      resetPassword: vi.fn(),
      logout: vi.fn(),
    },
  },
}))

const auth = vi.mocked(api.auth)

// who is signed in is module state, so every test starts signed out with no invite
beforeEach(() => {
  setUser(null)
  clearInvite()
  auth.me.mockResolvedValue(null)
  auth.config.mockResolvedValue({ inviteRequired: false })
})

const gate = () => render(<AuthGate><p>the pages</p></AuthGate>)

test('nothing shows while the session is checked, then a signed-in account gets the pages', async () => {
  let answer: (name: string | null) => void = () => {}
  auth.me.mockReturnValue(new Promise<string | null>(resolve => { answer = resolve }))
  gate()
  expect(screen.queryByText('the pages')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()

  await act(async () => answer('bryan'))
  expect(screen.getByText('the pages')).toBeInTheDocument()
})

test('signed out, signing in brings the pages', async () => {
  const user = userEvent.setup()
  auth.login.mockResolvedValue('bryan')
  gate()
  await user.type(await screen.findByLabelText('Username'), 'Bryan')
  await user.type(screen.getByLabelText('Password'), 'correct horse')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))

  expect(auth.login).toHaveBeenCalledWith('Bryan', 'correct horse')
  expect(await screen.findByText('the pages')).toBeInTheDocument()
  expect(getUser()).toBe('bryan')
})

test('an invite link opens on Create account with the code filled in, and the code is used up', async () => {
  const user = userEvent.setup()
  auth.config.mockResolvedValue({ inviteRequired: true })
  auth.signup.mockResolvedValue('friend')
  window.history.replaceState(null, '', '/#invite=let-me-in')
  takeInviteFromLink()
  gate()

  expect(await screen.findByLabelText('Invite code')).toHaveValue('let-me-in')
  await user.type(screen.getByLabelText('Username'), 'friend')
  await user.type(screen.getByLabelText('Password'), 'correct horse')
  await user.click(screen.getByRole('button', { name: 'Create account' }))

  expect(auth.signup).toHaveBeenCalledWith('friend', 'correct horse', 'let-me-in')
  expect(await screen.findByText('the pages')).toBeInTheDocument()
  expect(getInvite()).toBeNull()
})

test('the sentence the server refused with is shown, and the pages stay down', async () => {
  const user = userEvent.setup()
  auth.signup.mockRejectedValue(new Error('That username is taken.'))
  gate()
  await user.click(await screen.findByRole('button', { name: 'Make an account' }))
  await user.type(screen.getByLabelText('Username'), 'bryan')
  await user.type(screen.getByLabelText('Password'), 'correct horse')
  await user.click(screen.getByRole('button', { name: 'Create account' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('That username is taken.')
  expect(screen.getByLabelText('Username')).toHaveValue('bryan')
  expect(screen.queryByText('the pages')).not.toBeInTheDocument()
})

test('a session that ends takes the pages down and brings the form back', async () => {
  auth.me.mockResolvedValue('bryan')
  gate()
  expect(await screen.findByText('the pages')).toBeInTheDocument()

  act(() => markSignedOut())
  expect(screen.queryByText('the pages')).not.toBeInTheDocument()
  expect(await screen.findByLabelText('Username')).toBeInTheDocument()
})

test('forgetting a password then setting a new one signs the account in', async () => {
  const user = userEvent.setup()
  auth.forgotPassword.mockResolvedValue('reset-token-one')
  auth.resetPassword.mockResolvedValue('bryan')
  gate()

  await user.click(await screen.findByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Username'), 'Bryan')
  await user.click(screen.getByRole('button', { name: 'Continue' }))

  expect(auth.forgotPassword).toHaveBeenCalledWith('Bryan', '')
  expect(await screen.findByLabelText('New password')).toBeInTheDocument()
  await user.type(screen.getByLabelText('New password'), 'new password')
  await user.click(screen.getByRole('button', { name: 'Set new password' }))

  expect(auth.resetPassword).toHaveBeenCalledWith('reset-token-one', 'new password')
  expect(await screen.findByText('the pages')).toBeInTheDocument()
  expect(getUser()).toBe('bryan')
})
