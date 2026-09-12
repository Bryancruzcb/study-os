import { vi } from 'vitest'
import { lightSource, startLightField } from './light'

/* The field runs on animation frames, so the tests hold the frames themselves: nothing
   here waits on a timer, and every assertion is made about a known number of frames. */
let pending = new Map<number, FrameRequestCallback>()
let nextFrame = 1
let stop = () => {}

function frame() {
  const first = pending.keys().next()
  if (first.done) return false
  const run = pending.get(first.value)!
  pending.delete(first.value)
  run(0)
  return true
}

/* runs frames until the light has settled and the loop has stopped asking for more */
function settle(limit = 400) {
  for (let i = 0; i < limit; i++) if (!frame()) return
  throw new Error('the light never settled')
}

function box(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top,
    toJSON: () => ({}),
  } as DOMRect
}

/* jsdom lays nothing out, so a surface is given the box the test wants to light */
function surface(rect: DOMRect | (() => DOMRect), className = 'tile') {
  const el = document.createElement('div')
  el.className = className
  el.getBoundingClientRect = typeof rect === 'function' ? rect : () => rect
  document.body.append(el)
  return el
}

function move(x: number, y: number) {
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }))
}

function lit(el: HTMLElement) {
  return {
    x: el.style.getPropertyValue('--lit-x'),
    y: el.style.getPropertyValue('--lit-y'),
    near: Number(el.style.getPropertyValue('--lit-near') || 0),
  }
}

const glow = () => document.querySelector<HTMLElement>('.light-glow')

beforeEach(() => {
  pending = new Map()
  nextFrame = 1
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pending.set(nextFrame, cb)
    return nextFrame++
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { pending.delete(id) })
})

afterEach(() => {
  stop()
  stop = () => {}
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

test('the light lands on the surface where the cursor is, in the surface’s own box', () => {
  const el = surface(box(0, 0, 200, 100))
  stop = startLightField()
  move(50, 25)
  settle()
  expect(lit(el).x).toBe('25.0%')
  expect(lit(el).y).toBe('25.0%')
  expect(lit(el).near).toBeGreaterThan(0.9)
})

test('a button takes the light the way a card does', () => {
  const button = surface(box(0, 0, 120, 44), 'btn btn--secondary')
  stop = startLightField()
  move(30, 22)
  settle()
  expect(lit(button).x).toBe('25.0%')
  expect(lit(button).near).toBeGreaterThan(0.9)
})

test('an element that is not a lit surface is never written on', () => {
  const plain = surface(box(0, 0, 200, 100), 'lede')
  stop = startLightField()
  move(50, 25)
  settle()
  expect(lit(plain)).toEqual({ x: '', y: '', near: 0 })
})

test('the first cursor of the session lights where it is, rather than flying in from the corner', () => {
  const el = surface(box(0, 0, 200, 100))
  stop = startLightField()
  move(150, 75)
  frame()
  expect(lit(el).x).toBe('75.0%')
  expect(lit(el).y).toBe('75.0%')
})

test('the light trails the cursor across the box rather than jumping to it', () => {
  const el = surface(box(0, 0, 200, 100))
  stop = startLightField()
  move(0, 50)
  settle()
  move(200, 50)
  frame()
  const trailing = parseFloat(lit(el).x)
  expect(trailing).toBeGreaterThan(0)
  expect(trailing).toBeLessThan(100)
  settle()
  expect(parseFloat(lit(el).x)).toBeGreaterThan(99)
})

test('the page’s glow follows the light and fades in with it', () => {
  stop = startLightField()
  expect(glow()).toBeInTheDocument()
  move(320, 240)
  frame()
  expect(glow()!.style.transform).toBe('translate3d(320.0px, 240.0px, 0)')
  expect(Number(glow()!.style.opacity)).toBeLessThan(0.5)
  settle()
  expect(Number(glow()!.style.opacity)).toBeGreaterThan(0.9)
})

test('a surface out of the light’s reach carries no light at all', () => {
  const near = surface(box(0, 0, 200, 100))
  const far = surface(box(0, 900, 200, 100))
  stop = startLightField()
  move(50, 25)
  settle()
  expect(lit(near).near).toBeGreaterThan(0.9)
  expect(far.style.getPropertyValue('--lit-near')).toBe('')
})

test('the light leaves with the cursor', () => {
  const el = surface(box(0, 0, 200, 100))
  stop = startLightField()
  move(50, 25)
  settle()
  document.dispatchEvent(new MouseEvent('pointerleave'))
  settle()
  expect(el.style.getPropertyValue('--lit-near')).toBe('')
  expect(lightSource().level).toBe(0)
  expect(Number(glow()!.style.opacity)).toBe(0)
})

test('a scroll remeasures, so the light follows the surface rather than the page', () => {
  let rect = box(0, 0, 200, 100)
  const el = surface(() => rect)
  stop = startLightField()
  move(50, 25)
  settle()
  expect(lit(el).near).toBeGreaterThan(0.9)

  // the page scrolls the surface far below the cursor, which has not moved
  rect = box(0, 900, 200, 100)
  window.dispatchEvent(new Event('scroll'))
  settle()
  expect(el.style.getPropertyValue('--lit-near')).toBe('')
})

test('stopping the field takes its light, its glow and its listeners back off the page', () => {
  const el = surface(box(0, 0, 200, 100))
  stop = startLightField()
  move(50, 25)
  settle()
  expect(lit(el).near).toBeGreaterThan(0.9)
  stop()
  stop = () => {}
  expect(lit(el)).toEqual({ x: '', y: '', near: 0 })
  expect(glow()).not.toBeInTheDocument()
  // a cursor moving over the page afterwards lights nothing
  move(120, 60)
  expect(pending.size).toBe(0)
  expect(lit(el)).toEqual({ x: '', y: '', near: 0 })
})

test('a page that asked for less motion gets no field, no glow and no listeners', () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }))
  const el = surface(box(0, 0, 200, 100))
  stop = startLightField()
  move(50, 25)
  expect(pending.size).toBe(0)
  expect(glow()).not.toBeInTheDocument()
  expect(lit(el)).toEqual({ x: '', y: '', near: 0 })
})

test('a pointer that cannot hover gets no field either', () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('coarse'), media: query }))
  const el = surface(box(0, 0, 200, 100))
  stop = startLightField()
  move(50, 25)
  expect(pending.size).toBe(0)
  expect(glow()).not.toBeInTheDocument()
  expect(lit(el)).toEqual({ x: '', y: '', near: 0 })
})
