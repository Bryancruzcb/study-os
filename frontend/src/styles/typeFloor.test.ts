import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// jsdom does not lay text out, so the floor is checked where it is declared: every
// font-size in the stylesheets, in px or rem, has to come out at 12px or more
test('no stylesheet declares a font-size under 12px', () => {
  const sizes: { file: string; value: string; px: number }[] = []
  for (const file of readdirSync(here).filter(f => f.endsWith('.css'))) {
    const css = readFileSync(join(here, file), 'utf8')
    for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) {
      const value = m[1].trim()
      if (value === 'inherit') continue
      const px = value.endsWith('rem') ? parseFloat(value) * 16
        : value.endsWith('px') ? parseFloat(value)
        : Number.NaN
      sizes.push({ file, value, px })
    }
  }
  expect(sizes.length).toBeGreaterThan(0)
  expect(sizes.filter(s => Number.isNaN(s.px))).toEqual([])
  expect(sizes.filter(s => s.px < 12)).toEqual([])
})

test('the smallest declared size is exactly the 12px floor', () => {
  const all: number[] = []
  for (const file of readdirSync(here).filter(f => f.endsWith('.css'))) {
    for (const m of readFileSync(join(here, file), 'utf8').matchAll(/font-size:\s*(\d+(?:\.\d+)?)px;/g)) {
      all.push(parseFloat(m[1]))
    }
  }
  expect(Math.min(...all)).toBe(12)
})
