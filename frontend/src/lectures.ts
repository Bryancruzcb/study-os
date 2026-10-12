import type { IconName } from './icons'

/* How a lecture shows on the dashboard's path. A lecture is whatever PDF was uploaded, so
   its title, icon and tint are all worked out from the filename: the same file always gets
   the same three, and nothing about them is stored. */

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
  if (!s) return filename
  return s.charAt(0).toUpperCase() + s.slice(1)
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
