import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LIT } from '../shell/light'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, 'light.css'), 'utf8')

/* The light is written by a script that four things can stop: reduced motion, a pointer
   with no hover, a test, and the moment before the cursor first moves. Each of those
   leaves the surface with no --lit-* properties at all, so every read of one has to
   carry the value the page looks right without. */
test('every light property is read with a fallback', () => {
  const reads = [...css.matchAll(/var\(\s*--lit-[a-z-]+([^)]*)\)/g)]
  expect(reads.length).toBeGreaterThan(0)
  expect(reads.filter(m => !m[1].trim().startsWith(',')).map(m => m[0])).toEqual([])
})

/* the fallback that matters most: with no light at all, both layers are fully
   transparent and the surface is the surface */
test('with no light the layers are drawn at nothing', () => {
  expect(css).toMatch(/opacity:\s*var\(--lit-near,\s*0\)/)
})

/* the script lights LIT and the stylesheet paints its own copy of the list; a surface in
   one and not the other either glows with nothing to move it or moves nothing */
test('the stylesheet paints exactly the surfaces the script lights', () => {
  const items = (list: string) => list.split(',').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean).sort()
  const lists = [...css.matchAll(/:where\(([^)]*)\)/g)].map(m => m[1]).filter(list => list.includes('.nav'))
  expect(lists.length).toBeGreaterThanOrEqual(4)
  for (const list of lists) expect(items(list)).toEqual(items(LIT))
})
