import { ingestStatus, MAX_UPLOAD_BYTES, uploadProblem } from './uploads'

test('a lecture in any readable format can go', () => {
  for (const name of ['week1.pdf', 'deck.pptx', 'notes.docx', 'board.jpg', 'page.html', 'notes.md', 'scan.tiff']) {
    expect(uploadProblem({ name, size: 1024 })).toBeNull()
  }
})

test('the server decides on a file it might read, even with an unusual extension', () => {
  expect(uploadProblem({ name: 'lecture.key', size: 1024 })).toBeNull()
})

test('an empty file, a folder, a video or an archive is refused with what to do', () => {
  expect(uploadProblem({ name: 'Week 3', size: 0 })).toMatch(/^is empty\. If it is a folder/)
  expect(uploadProblem({ name: 'lecture.MP4', size: 10 })).toMatch(/^is not a lecture file/)
  expect(uploadProblem({ name: 'slides.zip', size: 10 })).toMatch(/^is not a lecture file/)
})

test('a file over the server limit is refused before it is sent, and says its size', () => {
  expect(uploadProblem({ name: 'big.pdf', size: MAX_UPLOAD_BYTES })).toBeNull()
  expect(uploadProblem({ name: 'big.pdf', size: MAX_UPLOAD_BYTES + 1 })).toBe(
    'is 32.0 MB, over the 32 MB limit. Split it, or export a smaller PDF.')
  expect(uploadProblem({ name: 'huge.pptx', size: 50 * 1024 * 1024 })).toMatch(/^is 50\.0 MB/)
})

test('the status sentence follows the phase and the files still waiting', () => {
  expect(ingestStatus('uploading', 'week1.pdf', 0)).toBe('Uploading week1.pdf…')
  expect(ingestStatus('uploading', 'week1.pdf', 2)).toBe('Uploading week1.pdf… 2 more files after it.')
  expect(ingestStatus('processing', 'deck.pptx', 1)).toBe('Reading deck.pptx for concepts and questions… 1 more file after it.')
  expect(ingestStatus('waiting', null, 3)).toBe('Waiting to upload 3 files…')
  expect(ingestStatus('idle', null, 0)).toBe('')
})
