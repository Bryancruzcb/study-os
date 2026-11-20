import heic2any from 'heic2any'
import { vi } from 'vitest'
import {
  byName, conversionFailure, isHeic, isPhotoSet, isPicture, jpegName, MAX_PHOTO_NAME, PHOTO_EDGE,
  photoNameOk, photoSetName, preparePhoto, scaledSize,
} from './photos'

vi.mock('heic2any', () => ({ default: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

test('a photo no longer than the edge on its long side is sent as it is', () => {
  expect(scaledSize(PHOTO_EDGE, 1800)).toBeNull()
  expect(scaledSize(1800, PHOTO_EDGE)).toBeNull()
  expect(scaledSize(640, 480)).toBeNull()
})

test('a longer photo is shrunk so its long edge is the edge, keeping its shape', () => {
  // a 12-megapixel phone photo, held either way
  expect(scaledSize(4032, 3024)).toEqual({ width: 2400, height: 1800 })
  expect(scaledSize(3024, 4032)).toEqual({ width: 1800, height: 2400 })
  expect(scaledSize(PHOTO_EDGE + 1, 100)).toEqual({ width: 2400, height: 100 })
  // a very thin strip never rounds down to nothing
  expect(scaledSize(10000, 1)).toEqual({ width: 2400, height: 1 })
})

test('pictures are told apart by extension, or by type when the name has none', () => {
  for (const name of ['a.jpg', 'a.JPEG', 'a.png', 'a.gif', 'a.bmp', 'a.tif', 'a.tiff', 'a.webp', 'IMG_0042.HEIC', 'a.heif']) {
    expect(isPicture({ name })).toBe(true)
  }
  expect(isPicture({ name: 'pasted', type: 'image/png' })).toBe(true)
  expect(isPicture({ name: 'week1.pdf', type: 'application/pdf' })).toBe(false)
  expect(isPicture({ name: 'diagram.svg', type: 'image/svg+xml' })).toBe(false)
  expect(isHeic({ name: 'IMG_0042.HEIC' })).toBe(true)
  expect(isHeic({ name: 'shared', type: 'image/heif' })).toBe(true)
  expect(isHeic({ name: 'IMG_0042.jpg' })).toBe(false)
})

test('two or more pictures and nothing else make a set worth asking about', () => {
  expect(isPhotoSet([{ name: 'a.jpg' }, { name: 'b.HEIC' }])).toBe(true)
  expect(isPhotoSet([{ name: 'a.jpg' }])).toBe(false)
  expect(isPhotoSet([{ name: 'a.jpg' }, { name: 'week1.pdf' }])).toBe(false)
})

test('a converted or shrunk photo is named for what it now is', () => {
  expect(jpegName('IMG_0042.HEIC')).toBe('IMG_0042.jpg')
  expect(jpegName('board.final.png')).toBe('board.final.jpg')
  expect(jpegName('noextension')).toBe('noextension.jpg')
})

test('the offered name is the day the photos arrived', () => {
  expect(photoSetName(new Date(2026, 10, 20))).toBe('Photos, Nov 20')
  expect(photoSetName(new Date(2027, 0, 3))).toBe('Photos, Jan 3')
})

test('the pages follow the photos’ names, with numbers in number order', () => {
  const names = ['IMG_10.jpg', 'IMG_9.jpg', 'img_2.jpg'].map(name => ({ name }))
  expect([...names].sort(byName).map(n => n.name)).toEqual(['img_2.jpg', 'IMG_9.jpg', 'IMG_10.jpg'])
})

test('a name must hold more than whitespace and at most 120 characters, counted as the server counts', () => {
  expect(photoNameOk('Photos, Nov 20')).toBe(true)
  expect(photoNameOk('   ')).toBe(false)
  expect(photoNameOk('x'.repeat(MAX_PHOTO_NAME))).toBe(true)
  expect(photoNameOk('x'.repeat(MAX_PHOTO_NAME + 1))).toBe(false)
  // spaces around it are trimmed before counting
  expect(photoNameOk(` ${'x'.repeat(MAX_PHOTO_NAME)} `)).toBe(true)
})

test('an iPhone photo is turned into a JPEG before it is sent', async () => {
  vi.mocked(heic2any).mockResolvedValueOnce(new Blob(['jpeg bytes'], { type: 'image/jpeg' }))
  const heic = new File(['heic bytes'], 'IMG_0042.HEIC', { type: 'image/heic' })
  const prepared = await preparePhoto(heic)
  expect(heic2any).toHaveBeenCalledWith(expect.objectContaining({ blob: heic, toType: 'image/jpeg', quality: 0.85 }))
  if (!prepared.ok) throw new Error(prepared.problem)
  expect(prepared.file.name).toBe('IMG_0042.jpg')
  expect(prepared.file.type).toBe('image/jpeg')
  expect(await prepared.file.text()).toBe('jpeg bytes')
})

test('a Live Photo or burst keeps the image the phone shows first', async () => {
  vi.mocked(heic2any).mockResolvedValueOnce([new Blob(['first']), new Blob(['second'])])
  const prepared = await preparePhoto(new File(['heic'], 'burst.heic'))
  if (!prepared.ok) throw new Error(prepared.problem)
  expect(await prepared.file.text()).toBe('first')
})

test('a HEIC this browser cannot convert says so and what to do', async () => {
  vi.mocked(heic2any).mockRejectedValueOnce(new Error('ERR_LIBHEIF format not supported'))
  expect(await preparePhoto(new File(['heic'], 'IMG_0042.HEIC'))).toEqual({
    ok: false,
    problem: "IMG_0042.HEIC couldn't be converted in this browser. Export it as JPEG and try again.",
  })
  expect(conversionFailure('a.heic')).toBe("a.heic couldn't be converted in this browser. Export it as JPEG and try again.")
})

test('a photo that is not HEIC never loads the converter, and one the browser cannot draw goes as it is', async () => {
  // jsdom has no createImageBitmap, which is the same as a browser that cannot decode the picture
  const jpeg = new File(['jpeg'], 'board.jpg', { type: 'image/jpeg' })
  expect(await preparePhoto(jpeg)).toEqual({ ok: true, file: jpeg })
  expect(heic2any).not.toHaveBeenCalled()
})

test('a long photo is drawn smaller on white and sent as a JPEG, and its bitmap is let go', async () => {
  const bitmap = { width: 4032, height: 3024, close: vi.fn() }
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
  const ctx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never)
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((done: BlobCallback, type?: string) => done(new Blob(['small'], { type })))
  try {
    const prepared = await preparePhoto(new File(['big png'], 'board.png', { type: 'image/png' }))
    if (!prepared.ok) throw new Error(prepared.problem)
    expect(ctx.fillStyle).toBe('white')
    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2400, 1800)
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85)
    expect(prepared.file.name).toBe('board.jpg')
    expect(prepared.file.type).toBe('image/jpeg')
    expect(bitmap.close).toHaveBeenCalled()
  } finally {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  }
})

test('a photo already small enough is sent untouched, not re-encoded', async () => {
  const bitmap = { width: 1600, height: 1200, close: vi.fn() }
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
  try {
    const small = new File(['png'], 'board.png', { type: 'image/png' })
    expect(await preparePhoto(small)).toEqual({ ok: true, file: small })
    expect(bitmap.close).toHaveBeenCalled()
  } finally {
    vi.unstubAllGlobals()
  }
})
