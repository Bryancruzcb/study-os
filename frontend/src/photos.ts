/* Photos of slides or a whiteboard, made ready to send. A phone photo is often HEIC, which the
   server cannot read, and often 12 megapixels, which is far more than a page needs: a set of
   them would not fit the server's 32 MB request. So every photo is turned into a JPEG no longer
   than PHOTO_EDGE on its long side before it leaves the browser. */

/* the long edge a photo is shrunk to; a slide photographed at this size still reads clearly */
export const PHOTO_EDGE = 2400
export const PHOTO_QUALITY = 0.85

/* the combined endpoint's limits: 2 to 50 photos, a name of at most 120 characters, and
   a request of at most 33 MB, of which a megabyte is left for the form's own bytes */
export const MIN_PHOTOS = 2
export const MAX_PHOTOS = 50
export const MAX_PHOTO_NAME = 120
export const MAX_PHOTOS_BYTES = 32 * 1024 * 1024

const PICTURE = /\.(jpe?g|png|gif|bmp|tiff?|webp|heic|heif)$/i
const PICTURE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff', 'image/webp',
  'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
])
const HEIC = /\.(heic|heif)$/i
const HEIC_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'])

type Named = Pick<File, 'name'> & { type?: string }

/* a picture the server can read once it is a JPEG: by extension, or by type when the name
   has none (a photo pasted from the clipboard is "image.png", one shared from a phone may not be) */
export function isPicture(file: Named): boolean {
  return PICTURE.test(file.name) || PICTURE_TYPES.has(file.type ?? '')
}

export function isHeic(file: Named): boolean {
  return HEIC.test(file.name) || HEIC_TYPES.has(file.type ?? '')
}

/* a drop or pick of two or more pictures and nothing else, which could be one lecture */
export function isPhotoSet(files: readonly Named[]): boolean {
  return files.length >= MIN_PHOTOS && files.every(isPicture)
}

/* the size to draw a photo at so its long edge is at most `edge`, keeping its shape; null when
   it is small enough already and goes as it is */
export function scaledSize(width: number, height: number, edge = PHOTO_EDGE): { width: number; height: number } | null {
  const long = Math.max(width, height)
  if (long <= edge) return null
  const scale = edge / long
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/* "IMG_0042.HEIC" becomes "IMG_0042.jpg", so the name says what the bytes now are */
export function jpegName(name: string): string {
  const dot = name.lastIndexOf('.')
  return `${dot > 0 ? name.slice(0, dot) : name}.jpg`
}

/* a name the combined endpoint takes: trimmed, not blank, at most 120 characters counted the
   way the server counts them, by code point */
export function photoNameOk(name: string): boolean {
  const trimmed = name.trim()
  return trimmed.length > 0 && [...trimmed].length <= MAX_PHOTO_NAME
}

/* the name a set of photos is offered under: "Photos, Nov 20" */
export function photoSetName(today: Date): string {
  return `Photos, ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(today)}`
}

/* phone cameras number their photos in the order they were taken (IMG_0041, IMG_0042), and a
   drop hands them over in whatever order the desktop chose, so the pages follow the names.
   numeric: IMG_9 comes before IMG_10 */
export function byName(a: Named, b: Named): number {
  return a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' })
}

export function conversionFailure(name: string): string {
  return `${name} couldn't be converted in this browser. Export it as JPEG and try again.`
}

export type Prepared = { ok: true; file: File } | { ok: false; problem: string }

/* The one photo as the server should get it: HEIC turned into JPEG, and anything longer than
   PHOTO_EDGE shrunk. A failed HEIC conversion is the only failure; a picture this browser cannot
   draw (TIFF outside Safari) goes as it is, and the server reads it. */
export async function preparePhoto(file: File): Promise<Prepared> {
  let photo = file
  if (isHeic(file)) {
    try {
      // over a megabyte of decoder, so it loads only when a HEIC file arrives
      const { default: heic2any } = await import('heic2any')
      const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: PHOTO_QUALITY })
      // a burst or Live Photo holds several images; the first is the one the phone shows
      const blob = Array.isArray(out) ? out[0] : out
      if (!blob) return { ok: false, problem: conversionFailure(file.name) }
      photo = new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified })
    } catch {
      return { ok: false, problem: conversionFailure(file.name) }
    }
  }
  return { ok: true, file: await shrink(photo) }
}

async function shrink(photo: File): Promise<File> {
  let bitmap: ImageBitmap
  try {
    // from-image is the default orientation, so a photo held sideways comes out upright
    bitmap = await createImageBitmap(photo)
  } catch {
    return photo
  }
  try {
    const size = scaledSize(bitmap.width, bitmap.height)
    if (!size) return photo
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return photo
    // a JPEG has no transparency, and a transparent PNG would otherwise come out on black
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, size.width, size.height)
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY))
    return blob ? new File([blob], jpegName(photo.name), { type: 'image/jpeg', lastModified: photo.lastModified }) : photo
  } finally {
    bitmap.close()
  }
}
