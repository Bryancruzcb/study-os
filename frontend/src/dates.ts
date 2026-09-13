const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/* "Sat, Sep 26" for "2026-09-26": spelled out by hand, so it reads the same in every locale,
   timezone and test */
export function dayLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  return `${WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]}, ${MONTHS[month - 1]} ${day}`
}
