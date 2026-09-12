/* Where a concept or a question comes from, cited the same way on the study page, in the
   bank and on the dashboard: the lecture file it was drawn from, then its slides. Pages are
   stored as the PDF's page numbers joined with commas, and a lecture PDF has one slide to a
   page. */
export function slides(pages: string): string {
  const numbers = pages.split(',').map(p => p.trim()).filter(Boolean)
  return `${numbers.length === 1 ? 'slide' : 'slides'} ${numbers.join(', ')}`
}

export function citation(lecture: string | null, pages: string | null): string | null {
  const parts = [lecture, pages ? slides(pages) : null].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(' · ') : null
}
