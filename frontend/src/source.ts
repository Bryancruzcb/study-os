/* Where a concept or a question comes from, cited the same way on the study page, in the
   bank and on the dashboard: the lecture it was drawn from, by the name the page gives it
   (lectureOf), then its slides. Pages are
   stored as the PDF's page numbers joined with commas, and a lecture PDF has one slide to a
   page. Three or more pages in a row read as a range: "slides 20–24, 26, 27". */
export function slides(pages: string): string {
  const numbers = pages.split(',').map(p => p.trim()).filter(Boolean)
  return `${numbers.length === 1 ? 'slide' : 'slides'} ${runs(numbers).join(', ')}`
}

/* consecutive whole numbers fold into "first–last" once there are three of them; anything
   that is not a whole number stays as it was written */
function runs(numbers: string[]): string[] {
  const out: string[] = []
  let i = 0
  while (i < numbers.length) {
    let j = i
    while (j + 1 < numbers.length && /^\d+$/.test(numbers[j]) && /^\d+$/.test(numbers[j + 1])
      && Number(numbers[j + 1]) === Number(numbers[j]) + 1) j++
    if (j - i >= 2) out.push(`${numbers[i]}–${numbers[j]}`)
    else out.push(...numbers.slice(i, j + 1))
    i = j + 1
  }
  return out
}

/* the first slide a question cites, or null when it cites none */
export function firstSlide(pages: string | null): number | null {
  const first = (pages ?? '').split(',').map(p => p.trim()).find(p => /^\d+$/.test(p))
  return first ? Number(first) : null
}

/* The lecture's PDF opened at that slide, in the browser's own viewer. An upload that came in
   as slides or a document was turned into this PDF, one page per slide, so page N is slide N. */
export function slideHref(lectureId: number, pages: string | null): string | null {
  const slide = firstSlide(pages)
  return slide === null ? null : `/api/materials/${lectureId}/pdf#page=${slide}`
}

export function citation(lecture: string | null, pages: string | null): string | null {
  const parts = [lecture, pages ? slides(pages) : null].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(' · ') : null
}
