import {
  conceptLectureNames, isGenericName, lectureIcon, lectureLabel, lectureName, lectureNames, lectureOf, lectureTint,
  lectureTitle, listedLectureNames, TINTS,
} from './lectures'

test('a lecture with a stored title goes by that title, whatever its file is called', () => {
  expect(lectureName('Lecture 3 Fall 2026.pptx', 'GEOG 1', 'Albedo and blackbody radiation', ['Albedo']))
    .toBe('Albedo and blackbody radiation')
  expect(lectureName('CS149 - Hard Disk Drives.pdf', 'CS 149', '  Hard disk drives ', [])).toBe('Hard disk drives')
})

test('without a title, a filename that says what the lecture is about is the name', () => {
  expect(lectureName('CS149 - Hard Disk Drives.pdf', 'CS 149', null, ['Seek time', 'Rotation'])).toBe('Hard Disk Drives')
  expect(lectureName('Week 3 Thermodynamics.pdf', 'PHYS 2', null, ['Heat'])).toBe('Week 3 Thermodynamics')
  // a blank title counts as none
  expect(lectureName('Process API.pdf', 'CS 149', '   ', ['fork'])).toBe('Process API')
})

test('a generic filename gives way to the lecture\'s first two topics, or its only one', () => {
  expect(lectureName('Lecture 3 Fall 2026.pptx', 'GEOG 1', null, ['Albedo', 'Blackbody radiation', 'Greenhouse effect']))
    .toBe('Albedo and Blackbody radiation')
  expect(lectureName('Lecture 3 Fall 2026.pptx', 'GEOG 1', undefined, ['Albedo'])).toBe('Albedo')
  // a quiz names each topic once per question, so repeats are read once and in order
  expect(lectureName('week04_slides.pdf', 'GEOG 1', null, ['Albedo', 'Albedo', ' ', 'Clouds'])).toBe('Albedo and Clouds')
  // a filename that is only the course code is generic too
  expect(lectureName('CS149.pdf', 'CS 149', null, ['Threads'])).toBe('Threads')
})

test('a generic filename with no topics falls back to the cleaned filename', () => {
  expect(lectureName('Lecture 3 Fall 2026.pptx', 'GEOG 1', null, [])).toBe('Lecture 3 Fall 2026')
  expect(lectureName('CS149.pdf', 'CS 149', null, [])).toBe('CS149.pdf')
})

test('a name is generic when it is only numbering words, numbers and a term', () => {
  for (const name of ['Lecture 3 Fall 2026', 'Lec3', 'Week 04 Slides', 'Class 12', 'Chapter 2 notes', 'Module 1 Part 2',
    'Spring 2027 Session 5', 'Unit 7', '3', '']) {
    expect(isGenericName(name)).toBe(true)
  }
  for (const name of ['Lecture 3 Thermodynamics', 'Hard Disk Drives', 'Week 3: Albedo', 'CS158A Transport Layer']) {
    expect(isGenericName(name)).toBe(false)
  }
})

test('the short label is the numbered word from the filename, spelled out the same way', () => {
  expect(lectureLabel('Lecture 3 Fall 2026.pptx', 'GEOG 1')).toBe('Lecture 3')
  expect(lectureLabel('Lec03 - Albedo.pdf', 'GEOG 1')).toBe('Lecture 3')
  expect(lectureLabel('wk04_notes.pdf', 'GEOG 1')).toBe('Week 4')
  expect(lectureLabel('GEOG1 Chapter 12.pdf', 'GEOG 1')).toBe('Chapter 12')
  // a filename with no numbered word has no label to add
  expect(lectureLabel('CS149 - Hard Disk Drives.pdf', 'CS 149')).toBeNull()
  expect(lectureLabel('Lecture3a.pdf', 'GEOG 1')).toBeNull()
})

test('the icon comes from the lecture\'s name, so a titled lecture gets its subject\'s icon', () => {
  expect(lectureIcon(lectureName('Lecture 3 Fall 2026.pptx', 'CS 149', 'Process scheduling', []))).toBe('calendar-clock')
  expect(lectureIcon(lectureName('Lecture 5 Fall 2026.pptx', 'CS 149', null, ['Locks', 'Mutexes']))).toBe('lock')
})

test('lectureNames names every lecture in a list of questions by its filename', () => {
  const names = lectureNames([
    { lecture: 'Lecture 1 Fall 2026.pdf', lectureTitle: null, topic: 'Albedo' },
    { lecture: 'Lecture 1 Fall 2026.pdf', lectureTitle: null, topic: 'Clouds' },
    { lecture: 'Lecture 2 Fall 2026.pdf', lectureTitle: 'Ocean currents', topic: 'Gyres' },
    { lecture: null, lectureTitle: null, topic: 'Orphaned' },
  ], 'GEOG 1')
  expect(names.get('Lecture 1 Fall 2026.pdf')).toBe('Albedo and Clouds')
  expect(names.get('Lecture 2 Fall 2026.pdf')).toBe('Ocean currents')
  expect(names.size).toBe(2)
})

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

test('a course\'s concepts name each lecture by its title, or by its first two topics in extraction order', () => {
  const names = conceptLectureNames([
    { lecture: 'Lecture 2 Fall 2026.pptx', lectureTitle: null, name: 'Air pressure' },
    { lecture: 'Lecture 2 Fall 2026.pptx', lectureTitle: null, name: 'Wind' },
    { lecture: 'Lecture 2 Fall 2026.pptx', lectureTitle: null, name: 'Fronts' },
    { lecture: 'Lecture 5.pdf', lectureTitle: 'Clouds and precipitation', name: 'Cumulus' },
    { lecture: null, name: 'Loose concept' },
  ], 'METR 112')
  expect([...names]).toEqual([
    ['Lecture 2 Fall 2026.pptx', 'Air pressure and Wind'],
    ['Lecture 5.pdf', 'Clouds and precipitation'],
  ])
})

test('the course\'s lecture list names each lecture the way its concepts do', () => {
  const names = listedLectureNames([
    { filename: 'Lecture 2 Fall 2026.pptx', lectureTitle: null, topics: ['Air pressure', 'Wind', 'Fronts'] },
    { filename: 'METR112_Radiation.pdf', lectureTitle: null, topics: ['Albedo'] },
  ], 'METR 112')
  expect(names.get('Lecture 2 Fall 2026.pptx')).toBe('Air pressure and Wind')
  expect(names.get('METR112_Radiation.pdf')).toBe('Radiation')
})

test('a row\'s lecture goes by the page\'s name for it, else its own title or cleaned file, never the raw file', () => {
  const names = new Map([['Lecture 2 Fall 2026.pptx', 'Air pressure and Wind']])
  expect(lectureOf({ lecture: 'Lecture 2 Fall 2026.pptx' }, names, 'METR 112')).toBe('Air pressure and Wind')
  // a lecture the page has not named yet, as while the list loads
  expect(lectureOf({ lecture: 'Lecture 7.pptx', lectureTitle: 'Thunderstorms' }, names, 'METR 112')).toBe('Thunderstorms')
  expect(lectureOf({ lecture: 'Lecture 7.pptx', lectureTitle: null }, names, 'METR 112')).toBe('Lecture 7')
  expect(lectureOf({ lecture: null }, names, 'METR 112')).toBeNull()
})
