/* What a student reads when something fails. A page shows a sentence that says what happened and
   what to do next, never a status code, a URL, or an "Error:" prefix; those go to the console for
   whoever is debugging. This lives apart from api.ts because page tests replace that module whole. */

export const OFFLINE = "Can't reach Study OS. Check your connection and try again."
export const SERVER_PROBLEM = 'Study OS hit a problem on the server. Try again in a moment.'
export const SOMETHING_WENT_WRONG = 'Something went wrong. Try again.'

const BY_STATUS: Readonly<Record<number, string>> = {
  400: "That request wasn't valid.",
  // the page also goes back to the sign-in form, so this is what is left on screen behind it
  401: 'Your sign-in ended. Sign in again.',
  403: "You don't have access to that.",
  404: "That isn't there any more. It may have been deleted.",
  409: 'That changed while you were working. Reload and try again.',
  413: 'That file is too big to upload (the limit is 32 MB).',
  429: 'Too many requests. Wait a moment and try again.',
}

/* The sentence for a failed response: the server's own when it sent one, since it knows what went
   wrong ("Pick at least one concept."), otherwise one chosen by the status. */
export function failureMessage(status: number, serverMessage: string | null = null): string {
  const sent = serverMessage?.trim()
  if (sent) return sent
  if (status >= 500) return SERVER_PROBLEM
  return BY_STATUS[status] ?? SOMETHING_WENT_WRONG
}

/* The sentence to show for anything a page caught. String(e) would read "Error: ..." */
export function messageOf(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return e.message
  if (typeof e === 'string' && e.trim()) return e
  return SOMETHING_WENT_WRONG
}
