import type { IconName } from './icons'

/* How a lecture is named and drawn wherever the student meets it. Extraction gives a lecture a
   short title naming its subject, and that is its name. A lecture ingested before titles existed
   is named from its filename, or from its first topics when the filename is only "Lecture 3 Fall
   2026". The tint comes from the filename, so the same file always gets the same colour. */

/* the course's own code at the front of a filename, spaces and separators optional:
   "CS 149" matches "CS149_", "CS149 - " and "cs 149 " */
function coursePrefix(courseName: string): RegExp | null {
  const chars = courseName.replace(/[^a-z0-9]/gi, '')
  if (chars.length < 2) return null
  return new RegExp(`^${[...chars].join('[\\s_-]*')}(?![a-z0-9])[\\s_\\-–:.]*`, 'i')
}

/* "CS149 - Hard Disk Drives.pdf" -> "Hard Disk Drives", "CS149_processAPI.pdf" -> "Process API",
   "CS149 System Calls with File I_O.pdf" -> "System Calls with File I/O". Windows writes a
   ":" or a "/" in a title as "_", so those come back; any other underscore is a space. A
   name with nothing left after the clean-up stays the filename. */
export function lectureTitle(filename: string, courseName: string): string {
  return cleanFilename(filename, courseName) || filename
}

/* the clean-up behind lectureTitle, which is empty when nothing is left */
function cleanFilename(filename: string, courseName: string): string {
  const prefix = coursePrefix(courseName)
  let s = filename.replace(/\.[a-z0-9]{2,4}$/i, '')
  if (prefix) s = s.replace(prefix, '')
  s = s
    .replace(/\b([A-Z])_([A-Z])\b/g, '$1/$2')
    .replace(/_ /g, ': ')
    .replace(/ - /g, ': ')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z]{2,})/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/* the words a professor numbers files with; a name made only of these, numbers and a term says
   when the lecture was, not what it is about */
const GENERIC_WORDS: ReadonlySet<string> = new Set([
  'lecture', 'lectures', 'lec', 'week', 'wk', 'class', 'chapter', 'ch', 'session', 'module', 'unit',
  'part', 'slides', 'slide', 'notes', 'note',
])
const SEASONS: ReadonlySet<string> = new Set(['fall', 'autumn', 'winter', 'spring', 'summer'])

/* "Lecture 3 Fall 2026", "Week 04 slides", "Lec3" and an empty name say nothing about the subject */
export function isGenericName(name: string): boolean {
  const words = name.toLowerCase().match(/[a-z]+|\d+/g) ?? []
  return words.every(w => /^\d+$/.test(w) || GENERIC_WORDS.has(w) || SEASONS.has(w))
}

/* the numbered word in a filename, spelled out the same way everywhere */
const NUMBERED = /\b(lectures?|lec|week|wk|class|chapter|ch|session|module|unit|part)[\s.#-]*0*(\d+)(?![a-z0-9])/i
const SPELLED: Readonly<Record<string, string>> = {
  lecture: 'Lecture', lectures: 'Lecture', lec: 'Lecture', week: 'Week', wk: 'Week', class: 'Class',
  chapter: 'Chapter', ch: 'Chapter', session: 'Session', module: 'Module', unit: 'Unit', part: 'Part',
}

/* The short label a filename carries, for secondary text under the lecture's name:
   "Lecture 3 Fall 2026.pptx" -> "Lecture 3", "wk04_notes.pdf" -> "Week 4". Null when the
   filename has no numbered word, since anything else would just repeat a longer name. */
export function lectureLabel(filename: string, courseName: string): string | null {
  const match = NUMBERED.exec(cleanFilename(filename, courseName))
  if (!match) return null
  return `${SPELLED[match[1].toLowerCase()]} ${Number(match[2])}`
}

/* A lecture's name for the student: the title extraction gave it; failing that the cleaned
   filename; and when the filename is generic, its first two topics joined with "and" (just the
   one when it has one). topics may repeat, as a quiz's questions do, and are read in order. */
export function lectureName(filename: string, courseName: string, title: string | null | undefined,
                            topics: readonly string[]): string {
  const stored = title?.trim()
  if (stored) return stored
  const cleaned = cleanFilename(filename, courseName)
  if (cleaned && !isGenericName(cleaned)) return cleaned
  const named = [...new Set(topics.map(t => t.trim()).filter(Boolean))]
  if (named.length >= 2) return `${named[0]} and ${named[1]}`
  if (named.length === 1) return named[0]
  return lectureTitle(filename, courseName)
}

/* one row that names a lecture's file and a topic from it, as a quiz question does */
export interface LectureSource {
  lecture: string | null
  lectureTitle?: string | null
  topic: string | null
}

/* every lecture's name keyed by its filename, from rows that each carry one of its topics; a
   course holds a filename once, so the filename is enough to find the lecture by */
export function lectureNames(rows: readonly LectureSource[], courseName: string): Map<string, string> {
  const found = new Map<string, { title: string | null; topics: string[] }>()
  for (const row of rows) {
    if (!row.lecture) continue
    const lecture = found.get(row.lecture) ?? { title: null, topics: [] }
    found.set(row.lecture, {
      title: lecture.title ?? row.lectureTitle ?? null,
      topics: row.topic ? [...lecture.topics, row.topic] : lecture.topics,
    })
  }
  return new Map([...found].map(([filename, l]) => [filename, lectureName(filename, courseName, l.title, l.topics)]))
}

/* The first keyword the title contains picks the icon; a title that matches none gets the
   open book. Order matters where two could match: "Condition Variables and Semaphores" is
   about waiting, so it is a cone before it is a lock. */
const ICON_RULES: ReadonlyArray<readonly [RegExp, IconName]> = [
  [/semaphore|condition variable/, 'traffic-cone'],
  [/\block|mutex/, 'lock'],
  [/\bdisk|\bdrive|\bssd|\braid\b|storage/, 'hard-drive'],
  [/\bbug|debug/, 'bug'],
  [/\bpipe|\bipc\b|inter-process|socket|network|protocol|\btcp\b|\budp\b|\bhttp|\bdns\b|\brout/, 'cable'],
  [/signal|interrupt/, 'radio'],
  [/schedul/, 'calendar-clock'],
  [/multilevel|queue/, 'list-ordered'],
  [/swap/, 'arrow-left-right'],
  [/address|paging|\bpage|\btlb\b|virtual memory/, 'map'],
  [/free-space|free space|fragment|alloc/, 'square-dashed'],
  [/memory|malloc|heap|cache/, 'memory-stick'],
  [/thread|concurren|parallel/, 'git-branch'],
  [/file system|filesystem|inode|journal/, 'folder-tree'],
  [/system call|syscall|\bi\/o\b/, 'file-code'],
  [/\bfiles?\b|director/, 'folder-open'],
  [/boot|partition/, 'power'],
  [/security|protect|privilege|direct execution|crypt|\bauth/, 'shield'],
  [/\bapi\b|shell|command|terminal/, 'square-terminal'],
  [/process/, 'cpu'],
  [/\bc\b|programming|\bcode|syntax/, 'braces'],
  [/recap|review|summary|overview/, 'brain'],
  [/\bvs\b|versus|compar/, 'split'],
]

export function lectureIcon(title: string): IconName {
  const t = title.toLowerCase()
  return ICON_RULES.find(([pattern]) => pattern.test(t))?.[1] ?? 'book-open'
}

export const TINTS = 6

/* one of the six tints, 1 to 6, from a hash of the filename, so a lecture keeps its colour
   when others are added or deleted around it */
export function lectureTint(filename: string): number {
  let h = 0
  for (const ch of filename) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return (h % TINTS) + 1
}
