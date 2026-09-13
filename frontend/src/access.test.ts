import { vi } from 'vitest'
import { getAccessCode, isLocked, setAccessCode, takeCodeFromLink } from './access'
import { api } from './api'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(() => setAccessCode(''))
afterEach(() => vi.unstubAllGlobals())

test('a code in the shared link is kept and taken out of the address bar', () => {
  window.history.replaceState(null, '', '/courses/2/study#access=open%20sesame')

  takeCodeFromLink()

  expect(getAccessCode()).toBe('open sesame')
  expect(window.location.hash).toBe('')
  expect(window.location.pathname).toBe('/courses/2/study')
})

test('every call carries the code once there is one', async () => {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json({})))
  vi.stubGlobal('fetch', fetchMock)
  setAccessCode('open-sesame')

  await api.evalReport()
  await api.next(1)
  await api.upload(1, new File(['%PDF-'], 'deck.pdf'))

  expect(fetchMock).toHaveBeenCalledTimes(3)
  for (const [, init] of fetchMock.mock.calls) {
    expect(new Headers((init as RequestInit).headers).get('X-Access-Code')).toBe('open-sesame')
  }
})

test('a 401 locks the app', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    Promise.resolve(json({ error: 'access code required' }, 401))))

  await expect(api.overview()).rejects.toThrow(/401/)
  expect(isLocked()).toBe(true)
})
