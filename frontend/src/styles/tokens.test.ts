import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// every colour is a token: a raw oklch() anywhere but tokens.css is a value that can
// drift from the palette on the next edit
test('no stylesheet but tokens.css writes a colour by hand', () => {
  const raw: { file: string; line: number; text: string }[] = []
  for (const file of readdirSync(here).filter(f => f.endsWith('.css') && f !== 'tokens.css')) {
    readFileSync(join(here, file), 'utf8').split(/\r?\n/).forEach((text, i) => {
      if (/oklch\(|#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(text)) raw.push({ file, line: i + 1, text: text.trim() })
    })
  }
  expect(raw).toEqual([])
})
