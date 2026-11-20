import { isPicture } from './photos'
import { plural } from './plural'

/* What the bank's file picker offers, and the check a picked or dropped file meets before it
   is sent. The server reads the bytes and has the last word on what a file is; this only stops
   a file that is plainly not a lecture (a video, an archive) or too big before it crosses the
   wire, so the student hears why at once instead of after a long upload. */

/* the extension list keeps every readable file visible in the OS picker; the mime types let
   a picker that matches on type alone show them too */
export const LECTURE_ACCEPT = [
  '.pdf', '.pptx', '.docx', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tif', '.tiff',
  '.heic', '.heif', '.html', '.htm', '.txt', '.md', '.markdown',
  'application/pdf', 'image/*', 'image/heic', 'image/heif', 'text/html', 'text/plain', 'text/markdown',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',')

/* one line for the picker's hint and the drop overlay */
export const LECTURE_KINDS = 'PDF, PowerPoint, Word, images, web pages or text'

/* the server's multipart limit, spring.servlet.multipart.max-file-size */
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024

const NOT_LECTURES = /\.(zip|rar|7z|tar|gz|mp4|mov|avi|mkv|webm|mp3|wav|m4a|aac|flac|exe|dmg|msi|iso)$/i

/* why this file will not be sent, as the end of a sentence that starts with its name; null
   when it can go. A HEIC photo can go: the browser turns it into a JPEG first (photos.ts) */
export function uploadProblem(file: Pick<File, 'name' | 'size'> & { type?: string }): string | null {
  // a dropped folder arrives as a file of no bytes
  if (file.size === 0) return 'is empty. If it is a folder, open it and drop the files inside.'
  // a photo is shrunk before it is sent, so its size is checked after that, by photoTooBig
  if (file.size > MAX_UPLOAD_BYTES && !isPicture(file)) {
    return `is ${megabytes(file.size)}, over the 32 MB limit. Split it, or export a smaller PDF.`
  }
  if (NOT_LECTURES.test(file.name)) return `is not a lecture file. Study OS reads ${LECTURE_KINDS}.`
  return null
}

/* a photo still over the limit once the browser has shrunk it, as the end of a sentence that
   starts with its name; null when it fits */
export function photoTooBig(file: Pick<File, 'size'>): string | null {
  return file.size > MAX_UPLOAD_BYTES
    ? `is ${megabytes(file.size)}, over the 32 MB limit. Export it smaller and try again.`
    : null
}

export function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export type IngestPhase = 'idle' | 'waiting' | 'uploading' | 'processing'

/* one sentence on where this course's uploads are, for a page that is not the bank */
export function ingestStatus(phase: IngestPhase, current: string | null, waiting: number): string {
  const after = waiting > 0 ? ` ${plural(waiting, 'more file')} after it.` : ''
  switch (phase) {
    case 'uploading': return `Uploading ${current}…${after}`
    case 'processing': return `Reading ${current} for concepts and questions…${after}`
    case 'waiting': return `Waiting to upload ${plural(waiting, 'file')}…`
    case 'idle': return ''
  }
}
