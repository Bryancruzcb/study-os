import { useEffect } from 'react'

/* The cursor is the page's one light source.

   Every surface in LIT gets three numbers written on it: where the light falls inside
   its own box (--lit-x and --lit-y, in percent) and how much of the light reaches it
   (--lit-near, 0 to 1). styles/light.css spends them on a soft glow along the edge the
   light reaches, a sheen where it lands, and the shade opposite the sheen. The page gets
   one thing more: a colour glow behind every surface that follows the light, so the light
   shows between the cards as well as on them. Atmosphere reads the same light for the
   header's field.

   A surface the light is not reaching carries no properties at all, so with the field
   off the page is the page as it was.

   The light trails the cursor rather than sticking to it. The lag is the whole trick:
   it reads as something liquid settling, not as a dot glued to the pointer. */

/* What the light lands on: the glass cards, and every button. styles/light.css paints
   exactly this list, and styles/lightFallback.test.ts holds the two to it. */
export const LIT = [
  '.nav', '.nav-links a', '.tile', '.figure-tile', '.qcard-big', '.opt', '.qcard',
  '.ledger-card', '.eval-panel', '.bank-empty', '.btn', '.tab', '.toggle',
].join(', ')

/* how far outside a surface the light still reaches, in CSS pixels */
const REACH = 260
/* the share of the gap to the cursor the light closes each frame */
const FOLLOW = 0.18
/* under this the light has arrived, and the loop sleeps until the cursor moves again */
const ARRIVED = 0.3
/* a --lit-near below this is no light at all: the properties come off the surface */
const DARK = 0.004

export interface Light {
  /* client coordinates, trailing the cursor */
  x: number
  y: number
  /* 0 with no cursor on the page, 1 with one, eased across the gap */
  level: number
}

const light: Light = { x: 0, y: 0, level: 0 }
const cursor = { x: 0, y: 0, on: false }

/* the shader lights its field from the same place the surfaces light theirs */
export function lightSource(): Readonly<Light> {
  return light
}

/* How much of the light a box in client coordinates is getting, 0 to 1: full inside,
   smoothly out to nothing at the reach. One falloff, used by the surfaces and by the
   header field, so nothing on the page disagrees about where the light stops. */
export function lightOn(box: { left: number; top: number; right: number; bottom: number }, reach = REACH): number {
  const gapX = Math.max(box.left - light.x, 0, light.x - box.right)
  const gapY = Math.max(box.top - light.y, 0, light.y - box.bottom)
  const t = Math.max(0, 1 - Math.hypot(gapX, gapY) / reach)
  return light.level * t * t * (3 - 2 * t)
}

function asks(query: string): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches
}

/* This is paint. A page that asked for less motion, and a pointer that cannot hover in
   the first place, both get the static surfaces and no listeners at all. */
export function lightFieldWanted(): boolean {
  return !asks('(prefers-reduced-motion: reduce)') && !asks('(pointer: coarse)')
}

/* percent, held either side of the box so a gradient centred just off a small surface
   still points the right way */
function clamp(pct: number): number {
  return Math.max(-60, Math.min(160, pct))
}

/* Starts the field and returns the stop, which takes the listeners, the page's glow and
   every property it wrote back off the page. */
export function startLightField(): () => void {
  if (!lightFieldWanted()) return () => {}

  // one element for the whole page, moved by transform rather than repainted
  const glow = document.createElement('div')
  glow.className = 'light-glow'
  glow.setAttribute('aria-hidden', 'true')
  document.body.append(glow)

  let surfaces: HTMLElement[] = []
  let boxes: DOMRect[] = []
  /* the last --lit-near written per surface, so a surface in the dark is left alone */
  let lit: number[] = []
  let stale = true
  let frame = 0

  /* Surfaces are measured once and the boxes reused until something that can move one
     happens: a scroll, a resize, or a route swapping the page out. Measuring every
     surface on every frame of a pointer sweep is a forced layout the effect does not
     need, and the pointer sweep is exactly when the page can least afford one. */
  function measure() {
    surfaces = Array.from(document.querySelectorAll<HTMLElement>(LIT))
    boxes = surfaces.map(el => el.getBoundingClientRect())
    lit = surfaces.map(() => -1)
    stale = false
  }

  function wake() {
    if (!frame) frame = requestAnimationFrame(step)
  }

  function invalidate() {
    stale = true
    wake()
  }

  function darken(i: number) {
    if (lit[i] === 0) return
    const el = surfaces[i]
    el.style.removeProperty('--lit-x')
    el.style.removeProperty('--lit-y')
    el.style.removeProperty('--lit-near')
    lit[i] = 0
  }

  function step() {
    frame = 0
    if (stale) measure()

    const goal = cursor.on ? 1 : 0
    light.x += (cursor.x - light.x) * FOLLOW
    light.y += (cursor.y - light.y) * FOLLOW
    light.level += (goal - light.level) * FOLLOW

    glow.style.transform = `translate3d(${light.x.toFixed(1)}px, ${light.y.toFixed(1)}px, 0)`
    glow.style.opacity = light.level.toFixed(3)

    for (let i = 0; i < surfaces.length; i++) {
      const box = boxes[i]
      // a surface with no box is unlaid or hidden; it has nothing to light
      if (!box.width || !box.height) continue
      const near = lightOn(box)
      if (near < DARK) {
        darken(i)
        continue
      }
      const el = surfaces[i]
      el.style.setProperty('--lit-x', `${clamp(((light.x - box.left) / box.width) * 100).toFixed(1)}%`)
      el.style.setProperty('--lit-y', `${clamp(((light.y - box.top) / box.height) * 100).toFixed(1)}%`)
      el.style.setProperty('--lit-near', near.toFixed(3))
      lit[i] = near
    }

    const travelling = Math.hypot(cursor.x - light.x, cursor.y - light.y) > ARRIVED
    if (travelling || Math.abs(goal - light.level) > DARK) {
      frame = requestAnimationFrame(step)
    } else {
      // the ease never quite lands, so the last frame puts the light exactly where it was
      // going; otherwise a cursor that left would leave the glow faintly on
      light.level = goal
      glow.style.opacity = goal.toFixed(3)
    }
  }

  function onMove(e: PointerEvent) {
    // the first cursor of the session lights where it is, rather than flying in from 0,0
    if (!cursor.on) {
      light.x = e.clientX
      light.y = e.clientY
    }
    cursor.x = e.clientX
    cursor.y = e.clientY
    cursor.on = true
    wake()
  }

  function onLeave() {
    cursor.on = false
    wake()
  }

  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerdown', onMove, { passive: true })
  document.addEventListener('pointerleave', onLeave)
  window.addEventListener('blur', onLeave)
  window.addEventListener('scroll', invalidate, { passive: true, capture: true })
  window.addEventListener('resize', invalidate)
  const moved = new MutationObserver(invalidate)
  moved.observe(document.body, { childList: true, subtree: true })
  // one pass now, so the first pointer event lands on boxes that are already measured
  wake()

  return () => {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    moved.disconnect()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerdown', onMove)
    document.removeEventListener('pointerleave', onLeave)
    window.removeEventListener('blur', onLeave)
    window.removeEventListener('scroll', invalidate, true)
    window.removeEventListener('resize', invalidate)
    for (let i = 0; i < surfaces.length; i++) darken(i)
    glow.remove()
    cursor.on = false
    light.level = 0
  }
}

/* the whole app is lit from one field, so this belongs to the root and nothing else */
export function useLightField(): void {
  useEffect(() => startLightField(), [])
}
