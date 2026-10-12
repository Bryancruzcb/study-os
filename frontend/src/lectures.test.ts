import { lectureIcon, lectureTint, lectureTitle, TINTS } from './lectures'

test('a lecture title drops the course code, the extension and the filename punctuation', () => {
  expect(lectureTitle('CS149 - Hard Disk Drives.pdf', 'CS 149')).toBe('Hard Disk Drives')
  expect(lectureTitle('CS149_processAPI.pdf', 'CS 149')).toBe('Process API')
  expect(lectureTitle('CS149 System Calls with File I_O.pdf', 'CS 149')).toBe('System Calls with File I/O')
  expect(lectureTitle('CS149 Inter-Process Communication_ Pipes and Memory mapped files (mmap).pdf', 'CS 149'))
    .toBe('Inter-Process Communication: Pipes and Memory mapped files (mmap)')
  expect(lectureTitle('CS149_security_lim_direct_execution.pdf', 'CS 149')).toBe('Security lim direct execution')
})

test('only the course\'s own code is dropped, and a name with nothing else left stays whole', () => {
  // another course's code is part of the title
  expect(lectureTitle('CS158A Transport Layer.pdf', 'CS 149')).toBe('CS158A Transport Layer')
  // the code has to end where the word ends: CS1490 is not CS 149
  expect(lectureTitle('CS1490 notes.pdf', 'CS 149')).toBe('CS1490 notes')
  expect(lectureTitle('CS149.pdf', 'CS 149')).toBe('CS149.pdf')
  expect(lectureTitle('Lecture 3.pdf', 'CS 158A')).toBe('Lecture 3')
})

test('the icon comes from the first keyword in the title, with a book for anything else', () => {
  expect(lectureIcon('Hard Disk Drives')).toBe('hard-drive')
  expect(lectureIcon('Condition Variables and Semaphores')).toBe('traffic-cone')
  expect(lectureIcon('Locks: Advanced')).toBe('lock')
  expect(lectureIcon('Process API')).toBe('square-terminal')
  expect(lectureIcon('Process')).toBe('cpu')
  expect(lectureIcon('System Calls with File I/O')).toBe('file-code')
  expect(lectureIcon('Files and Directories')).toBe('folder-open')
  expect(lectureIcon('Swapping Mechanisms and Policies')).toBe('arrow-left-right')
  expect(lectureIcon('Lecture 3')).toBe('book-open')
})

test('a lecture keeps one tint, and every tint is one of the six', () => {
  expect(lectureTint('CS149_process.pdf')).toBe(lectureTint('CS149_process.pdf'))
  const tints = new Set(Array.from({ length: 60 }, (_, i) => lectureTint(`Lecture ${i}.pdf`)))
  expect([...tints].every(t => t >= 1 && t <= TINTS)).toBe(true)
  expect(tints.size).toBe(TINTS)
})
