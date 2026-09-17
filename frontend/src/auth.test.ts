import { vi } from 'vitest'
import { api } from './api'
import { clearInvite, getInvite, getUser, setUser, takeInviteFromLink } from './auth'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  setUser('bryan')
  clearInvite()
  document.cookie = 'XSRF-TOKEN=token%2Fone; path=/'
})
afterEach(() => vi.unstubAllGlobals())

test('an invite in the shared link is kept for the form and taken out of the address bar', () => {
  window.history.replaceState(null, '', '/#invite=let%20me%20in')

  takeInviteFromLink()

  expect(getInvite()).toBe('let me in')
  expect(window.location.hash).toBe('')
  clearInvite()
  expect(getInvite()).toBeNull()
})

test('a write carries the CSRF token from the cookie, and a read does not', async () => {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json({})))
  vi.stubGlobal('fetch', fetchMock)

  await api.evalReport()
  await api.retire(9)
  await api.upload(1, new File(['%PDF-'], 'deck.pdf'))

  const token = (call: number) =>
    new Headers((fetchMock.mock.calls[call][1] as RequestInit).headers).get('X-XSRF-TOKEN')
  expect(token(0)).toBeNull()
  expect(token(1)).toBe('token/one')
  expect(token(2)).toBe('token/one')
})

test('a 401 from any call signs the page out', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 401 }))))

  await expect(api.overview()).rejects.toThrow(/401/)
  expect(getUser()).toBeNull()
})

test('me says who is signed in, and null when nobody is', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockImplementationOnce(() => Promise.resolve(json({ username: 'bryan' })))
    .mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 401 }))))

  await expect(api.auth.me()).resolves.toBe('bryan')
  await expect(api.auth.me()).resolves.toBeNull()
})

test('a refused sign-in throws the sentence the server wrote', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    Promise.resolve(json({ error: 'Wrong username or password.' }, 401))))

  await expect(api.auth.login('bryan', 'wrong horse')).rejects.toThrow('Wrong username or password.')
})

test('forgetting a password posts the username and returns the reset token', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    Promise.resolve(json({ resetToken: 'token-one' }))))

  await expect(api.auth.forgotPassword('Bryan', 'let-me-in')).resolves.toBe('token-one')
  const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
  expect(url).toBe('/api/auth/forgot-password')
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({
    username: 'Bryan',
    inviteCode: 'let-me-in',
  })
})

test('a refused reset throws the sentence the server wrote', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    Promise.resolve(json({ error: 'That reset code was not accepted.' }, 400))))

  await expect(api.auth.resetPassword('dead', 'new password')).rejects.toThrow(
    'That reset code was not accepted.')
})
