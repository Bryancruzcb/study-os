import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, type Material } from '../api'
import { messageOf } from '../errors'
import { byName, isPhotoSet, isPicture, MAX_PHOTOS, MAX_PHOTOS_BYTES, MAX_PHOTOS_MB, MIN_PHOTOS, photoNameOk, preparePhoto } from '../photos'
import { plural } from '../plural'
import { megabytes, photoTooBig, uploadProblem } from '../uploads'
import { NOTHING_YET, QueueContext, type Active, type Job, type Outcome, type PhotoAnswer, type Queue } from './uploadState'

/* what a job came to before extraction: the server's row, or the lines saying why it never went */
type Sent = { ok: true; material: Material } | { ok: false; problems: string[] }

const POLL_MS = 1500

function withFailures(error: string | null, failures: readonly string[]): string | null {
  const lines = [...(error ? [error] : []), ...failures]
  return lines.length > 0 ? lines.join('\n') : null
}

function jobName(job: Job): string {
  return job.kind === 'file' ? job.file.name : `${job.name} (${plural(job.photos.length, 'photo')})`
}

/* Sends one job. A photo is made ready first (HEIC to JPEG, shrunk); a set of photos is made
   ready one at a time, so only one full-size photo is decoded at once, and goes only when every
   photo converted and the whole set fits one request. */
async function sendJob(job: Job): Promise<Sent> {
  if (job.kind === 'file') {
    if (!isPicture(job.file)) return { ok: true, material: await api.upload(job.courseId, job.file) }
    const prepared = await preparePhoto(job.file)
    if (!prepared.ok) return { ok: false, problems: [prepared.problem] }
    const tooBig = photoTooBig(prepared.file)
    if (tooBig) return { ok: false, problems: [`${job.file.name} ${tooBig}`] }
    return { ok: true, material: await api.upload(job.courseId, prepared.file) }
  }
  const ready: File[] = []
  const problems: string[] = []
  for (const photo of job.photos) {
    const prepared = await preparePhoto(photo)
    if (prepared.ok) ready.push(prepared.file)
    else problems.push(prepared.problem)
  }
  if (problems.length > 0) return { ok: false, problems }
  const bytes = ready.reduce((n, photo) => n + photo.size, 0)
  if (bytes > MAX_PHOTOS_BYTES) {
    return {
      ok: false,
      problems: [`${job.name}: the photos come to ${megabytes(bytes)} even after shrinking, over the ${MAX_PHOTOS_MB} MB one lecture can take. Send them as two smaller sets.`],
    }
  }
  return { ok: true, material: await api.uploadPhotos(job.courseId, job.name.trim(), ready) }
}

/* The app's one upload queue. One worker sends the queued jobs one at a time, whichever course
   each is for, so two drops never race each other to the server, and a drop on the home page and
   one on a course page wait in the same line. It sits above the routes, so an upload keeps going
   while the student moves between home and the courses. */
export function UploadQueueProvider({ children }: { children: ReactNode }) {
  // The queue and the open questions are refs because the worker and the handlers read them
  // between awaits and renders; `waiting` and `questions` mirror them for the render. Every job
  // carries its course, so a file on its way into one course never shows on, or lands in, another.
  const queue = useRef<Job[]>([])
  const working = useRef(false)
  const asked = useRef<Record<number, readonly File[]>>({})
  const [active, setActive] = useState<Active | null>(null)
  const [waiting, setWaiting] = useState<readonly Job[]>([])
  const [outcomes, setOutcomes] = useState<Readonly<Record<number, Outcome>>>({})
  const [questions, setQuestions] = useState<Readonly<Record<number, readonly File[]>>>({})

  const finish = useCallback((courseId: number, failures: readonly string[]) => setOutcomes(all => {
    const own = all[courseId] ?? NOTHING_YET
    return { ...all, [courseId]: { error: withFailures(own.error, failures), finished: own.finished + 1 } }
  }), [])

  // one job: send it, then poll while its long deck finishes in the background; each failure
  // comes back as a line naming the file
  const run = useCallback(async (job: Job): Promise<string[]> => {
    const name = jobName(job)
    setActive({ courseId: job.courseId, name, phase: 'uploading' })
    try {
      const sent = await sendJob(job)
      if (!sent.ok) return sent.problems
      let m = sent.material
      if (m.status === 'PENDING') {
        setActive({ courseId: job.courseId, name, phase: 'processing' })
        while (m.status === 'PENDING') {
          await new Promise(r => setTimeout(r, POLL_MS))
          m = await api.material(m.id)
        }
      }
      return m.status === 'FAILED' ? [`${name}: ${m.errorMessage ?? 'Ingest failed'}`] : []
    } catch (e) {
      return [`${name}: ${messageOf(e)}`]
    }
  }, [])

  const work = useCallback(async () => {
    if (working.current) return
    working.current = true
    try {
      for (let job = queue.current.shift(); job; job = queue.current.shift()) {
        setWaiting([...queue.current])
        finish(job.courseId, await run(job))
      }
    } finally {
      working.current = false
      setActive(null)
      setWaiting([])
    }
  }, [run, finish])

  const push = useCallback((jobs: readonly Job[]) => {
    if (jobs.length === 0) return
    queue.current.push(...jobs)
    setWaiting([...queue.current])
    void work()
  }, [work])

  const ask = useCallback((courseId: number, photos: readonly File[] | null) => {
    const next = { ...asked.current }
    delete next[courseId]
    if (photos) next[courseId] = photos
    asked.current = next
    setQuestions(next)
  }, [])

  // a file the browser can tell is not a lecture, or is too big, is refused here and never sent
  const upload = useCallback((to: number, files: readonly File[]) => {
    const refused: string[] = []
    const accepted: File[] = []
    for (const file of files) {
      const problem = uploadProblem(file)
      if (problem) refused.push(`${file.name} ${problem}`)
      else accepted.push(file)
    }
    // a new batch starts clean; files added while one runs add to its failures
    const fresh = !working.current
    setOutcomes(all => {
      const own = all[to] ?? NOTHING_YET
      return { ...all, [to]: { ...own, error: withFailures(fresh ? null : own.error, refused) } }
    })
    // photos and nothing else could be pages of one lecture, so they wait for the student's
    // answer; more photos dropped while the question is open join it, even a single one
    const open = asked.current[to]
    const joins = open
      ? files.length > 0 && files.every(isPicture)
      : isPhotoSet(files) && accepted.length >= MIN_PHOTOS
    if (joins) {
      ask(to, [...(open ?? []), ...accepted])
      return
    }
    push(accepted.map(file => ({ kind: 'file', courseId: to, file })))
  }, [ask, push])

  const answer = useCallback((to: number, reply: PhotoAnswer) => {
    const photos = asked.current[to]
    if (!photos) return
    // the pages, or the lectures, follow the photos' names, which is the order a phone took them in
    const ordered = [...photos].sort(byName)
    if (reply.kind === 'one') {
      if (!photoNameOk(reply.name) || ordered.length > MAX_PHOTOS) return
      ask(to, null)
      push([{ kind: 'photos', courseId: to, name: reply.name.trim(), photos: ordered }])
      return
    }
    ask(to, null)
    if (reply.kind === 'separate') push(ordered.map(file => ({ kind: 'file', courseId: to, file })))
  }, [ask, push])

  const clearError = useCallback((to: number) => setOutcomes(all => (
    all[to]?.error ? { ...all, [to]: { ...all[to], error: null } } : all
  )), [])

  const value = useMemo<Queue>(
    () => ({ active, waiting, outcomes, questions, upload, clearError, answer }),
    [active, waiting, outcomes, questions, upload, clearError, answer],
  )
  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>
}
