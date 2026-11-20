import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { MAX_PHOTO_NAME, MAX_PHOTOS, photoNameOk, photoSetName } from '../photos'
import '../styles/uploads.css'
import { usePhotoQuestion, type PhotoAnswer } from './uploadState'

/* "5 photos: make them one lecture, or 5 separate lectures?", asked in the page where the
   photos were dropped or picked, with the one lecture's name ready to edit. course names the
   course when the page is not that course's own (home). Nothing shows while nothing is asked. */
export default function PhotoChoice({ courseId, course }: { courseId: number; course?: string }) {
  const { photos, answer } = usePhotoQuestion(courseId)
  if (!photos) return null
  return <Choice key={courseId} count={photos.length} course={course} answer={answer} />
}

function Choice({ count, course, answer }: { count: number; course?: string; answer: (a: PhotoAnswer) => void }) {
  const [name, setName] = useState(() => photoSetName(new Date()))
  const field = useRef<HTMLInputElement>(null)
  const askId = useId()
  const tooMany = count > MAX_PHOTOS
  const canJoin = photoNameOk(name) && !tooMany

  // the question turns up after a drop, wherever the caret was; moving it to the name lets
  // the keyboard answer at once, inside a region a screen reader names by the question
  useEffect(() => {
    field.current?.focus()
  }, [])

  function onJoin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (canJoin) answer({ kind: 'one', name })
  }

  return (
    <section className="photo-choice" aria-labelledby={askId}>
      <p className="photo-choice-ask" id={askId}>
        {count} photos{course ? ` for ${course}` : ''}: make them one lecture, or {count} separate lectures?
      </p>
      <form className="photo-choice-form" onSubmit={onJoin}>
        <label className="field">
          <span className="field-label">Lecture name</span>
          <input className="input" ref={field} value={name} maxLength={MAX_PHOTO_NAME}
            onChange={e => setName(e.target.value)} />
        </label>
        <span className="photo-choice-actions">
          <button className="btn btn--micro" type="submit" disabled={!canJoin}>One lecture</button>
          <button className="btn btn--secondary btn--micro" type="button"
            onClick={() => answer({ kind: 'separate' })}>{count} separate lectures</button>
          <button className="btn btn--ghost btn--micro" type="button"
            onClick={() => answer({ kind: 'cancel' })}>Cancel</button>
        </span>
      </form>
      {tooMany && (
        <p className="hint">One lecture takes at most {MAX_PHOTOS} photos. Send these as separate lectures, or in smaller sets.</p>
      )}
    </section>
  )
}
