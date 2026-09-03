import { vi } from 'vitest'
import { api } from './api'

// The vite dev server answers an unproxied /api path with index.html and a 200. Parsing
// that as JSON reports "Unexpected token '<'", which sends you looking in the wrong place.
test('a 200 that is not JSON names the proxy, not the parser', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response('<!doctype html><html></html>', {
      status: 200, headers: { 'content-type': 'text/html' },
    })))

  await expect(api.evalReport()).rejects.toThrow(/not JSON/)
  await expect(api.evalReport()).rejects.toThrow(/proxied/)
  vi.unstubAllGlobals()
})

test('a JSON body still parses', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ labeled: 3 }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })))

  await expect(api.evalReport()).resolves.toMatchObject({ labeled: 3 })
  vi.unstubAllGlobals()
})
