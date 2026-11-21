import { afterEach, beforeEach, vi } from 'vitest'
import { api } from './api'
import { OFFLINE, SERVER_PROBLEM } from './errors'

function answer(body: string, status: number, type = 'application/json') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(body, { status, headers: { 'content-type': type } })))
}

let debug: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// The vite dev server answers an unproxied /api path with index.html and a 200. Parsing
// that as JSON reports "Unexpected token '<'", which sends you looking in the wrong place.
test('a 200 that is not JSON names the proxy in the console and shows the page a plain sentence', async () => {
  answer('<!doctype html><html></html>', 200, 'text/html')

  await expect(api.dashboard(1)).rejects.toThrow(SERVER_PROBLEM)
  expect(String(debug.mock.calls[0][0])).toMatch(/not JSON.*proxied/)
})

test('a JSON body still parses', async () => {
  answer(JSON.stringify({ dueToday: 3, concepts: [] }), 200)

  await expect(api.dashboard(1)).resolves.toMatchObject({ dueToday: 3 })
})

test('a refusal carries the server\'s own sentence', async () => {
  answer(JSON.stringify({ error: 'Pick at least one concept.' }), 400)

  await expect(api.generateMore(1, { conceptIds: [], count: 5, types: 'MC' }))
    .rejects.toThrow('Pick at least one concept.')
})

test('a failure without a sentence gets one for its status, and the status and URL stay off the page', async () => {
  answer('', 404, 'text/plain')

  const failed = await api.quizProgress(1).catch((e: unknown) => e)
  expect(failed).toBeInstanceOf(Error)
  expect((failed as Error).message).toBe('That isn\'t there any more. It may have been deleted.')
  expect((failed as Error).message).not.toMatch(/404|\/api/)
  expect(debug).toHaveBeenCalledWith('404 /api/courses/1/quiz/progress')
})

test('a server error page becomes the server sentence', async () => {
  answer('<html>Bad Gateway</html>', 502, 'text/html')

  await expect(api.dashboard(1)).rejects.toThrow(SERVER_PROBLEM)
})

test('no answer at all says the server cannot be reached', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

  await expect(api.overview()).rejects.toThrow(OFFLINE)
})

test('a refused sign-in shows the form\'s sentence', async () => {
  answer(JSON.stringify({ error: 'Wrong username or password.' }), 401)

  await expect(api.auth.login('bryan', 'nope')).rejects.toThrow('Wrong username or password.')
})

test('a refused photo set carries the server\'s sentence, and a 413 says to split the set', async () => {
  const photo = new File(['x'], 'IMG_1.jpg', { type: 'image/jpeg' })
  answer(JSON.stringify({ error: 'Send at least two photos.' }), 400)
  await expect(api.uploadPhotos(1, 'Board', [photo])).rejects.toThrow('Send at least two photos.')

  answer('', 413, 'text/plain')
  await expect(api.uploadPhotos(1, 'Board', [photo, photo])).rejects.toThrow(/two smaller sets/)
})
