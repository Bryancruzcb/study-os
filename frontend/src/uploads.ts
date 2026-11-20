import { plural } from './plural'

/* What the bank's file picker offers, and the check a picked or dropped file meets before it
   is sent. The server reads the bytes and has the last word on what a file is; this only stops
   a file that is plainly not a lecture (a video, an archive) or too big before it crosses the
   wire, so the student hears why at once instead of after a long upload. */

/* the extension list keeps every readable file visible in the OS picker; the mime types let
   a picker that matches on type alone show them too */
export const LECTURE_ACCEPT = [
  '.pdf', '.pptx', '.docx', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tif', '.tiff',
  '.html', '.htm', '.txt', '.md', '.markdown',
  'application/pdf', 'image/*', 'text/html', 'text/plain', 'text/markdown',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',')

/* one line for the picker's hint and the drop overlay */
export const LECTURE_KINDS = 'PDF, PowerPoint, Word, images, web pages or text'

/* the server's multipart limit, spring.servlet.multipart.max-file-size */
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024

const NOT_LECTURES = /\.(zip|rar|7z|tar|gz|mp4|mov|avi|mkv|webm|mp3|wav|m4a|aac|flac|exe|dmg|msi|iso)$/i

/* why this file will not be sent, as the end of a sentence that starts with its name; null
   when it can go */
export function uploadProblem(file: Pick<File, 'name' | 'size'>): string | null {
  // a dropped folder arrives as a file of no bytes
  if (file.size === 0) return 'is empty. If it is a folder, open it and drop the files inside.'
  if (file.size > MAX_UPLOAD_BYTES) {
    return `is ${megabytes(file.size)}, over the 32 MB limit. Split it, or export a smaller PDF.`
  }
  if (NOT_LECTURES.test(file.name)) return `is not a lecture file. Study OS reads ${LECTURE_KINDS}.`
  return null
}

function megabytes(bytes: number): string {
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
