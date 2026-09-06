import { useLayoutEffect, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { api, type ConceptWithQuestions, type Question } from '../api'
import { plural } from '../plural'
import type { BankContext } from './BankRoute'

interface LabelBody { answerable: boolean; correctAnswer: boolean; unambiguous: boolean }

const labelled = (q: Question) =>
  q.labelAnswerable != null || q.labelCorrectAnswer != null || q.labelUnambiguous != null

export default function BankConceptPage() {
  const { conceptId } = useParams()
  const { bank, reload, refresh, setError } = useOutletContext<BankContext>()
  if (!bank) return <p className="empty">Loading…</p>
  const concept = bank.find(c => c.id === Number(conceptId))
  // the list is right there, so a bad id needs no way back, only the word
  if (!concept) return <p className="alert" role="alert">No concept has id {conceptId}.</p>
  // keyed, so the arming and the focus bookkeeping start over when the concept changes
  return <ConceptCards key={concept.id} concept={concept} reload={reload} refresh={refresh} setError={setError} />
}

function ConceptCards({ concept, reload, refresh, setError }: {
  concept: ConceptWithQuestions
  reload: () => Promise<void>
  refresh: () => Promise<void>
  setError: (e: string | null) => void
}) {
  // the question whose retire is armed, or null. one at a time, so arming a card takes
  // the arming away from whichever card held it and only one confirm is ever on screen
  const [armed, setArmed] = useState<number | null>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  // the danger cell's button per question, so the caret can be put back on the card it
  // was working when confirm, cancel or restore unmounts the control it was sitting on
  const dangerButtons = useRef(new Map<number, HTMLButtonElement | null>())
  // a ref, not state: this is a one-shot command to the DOM after the next render
  const pendingFocus = useRef<number | null>(null)

  // an armed card holds focus on Cancel rather than on the confirm that took Retire's
  // place, so the repeat of a held Enter, or a stuttered second press, disarms the card
  useLayoutEffect(() => {
    if (armed != null) cancelButton.current?.focus()
  }, [armed])

  // runs after whichever render the handler queued, so the caret lands on whatever the
  // cell now holds rather than on document.body
  useLayoutEffect(() => {
    const id = pendingFocus.current
    if (id == null) return
    pendingFocus.current = null
    dangerButtons.current.get(id)?.focus()
  })

  async function onRetire(qid: number) {
    // disarming first means a second click of an accidental double lands on Cancel, which
    // takes over the pixels Retire gave up at the card's right edge
    setArmed(null)
    setError(null)
    try {
      await api.retire(qid)
      await reload()
      pendingFocus.current = qid
      // the head counts ACTIVE questions, so it just moved too
      await refresh()
    } catch (e) {
      setError(String(e))
    }
  }

  async function onRestore(qid: number) {
    setError(null)
    try {
      await api.restore(qid)
      await reload()
      pendingFocus.current = qid
      await refresh()
    } catch (e) {
      setError(String(e))
    }
  }

  async function onLabel(qid: number, body: LabelBody) {
    setError(null)
    try {
      await api.label(qid, body)
      return true
    } catch (e) {
      setError(String(e))
      return false
    }
  }

  const active = concept.questions.filter(q => q.status === 'ACTIVE').length
  const retired = concept.questions.length - active

  return (
    <div className="concept">
      <div className="concept-top">
        <div className="chips">
          {concept.sourcePages && <span className="chip chip--mono">pp. {concept.sourcePages}</span>}
          <span className="count">{plural(active, 'question')}{retired > 0 && ` · ${retired} retired`}</span>
        </div>
        <h2>{concept.name}</h2>
        <p className="concept-summary">{concept.summary}</p>
      </div>
      <ul className="qcards">
        {concept.questions.map(q => (
          <li className={q.status === 'RETIRED' ? 'qcard qcard--retired' : 'qcard'} key={q.id}>
            <div className="chips">
              <span className="chip">{q.type === 'MC' ? 'Multiple choice' : 'Short answer'}</span>
              {q.sourcePages && <span className="chip chip--mono">pp. {q.sourcePages}</span>}
              {q.status === 'RETIRED' && <span className="chip chip--flag">Retired</span>}
            </div>
            <p className="qcard-prompt">{q.prompt}</p>
            <div className="qcard-foot">
              {q.status === 'RETIRED' ? (
                <>
                  <span className="count">{labelled(q) ? 'labeled' : 'not labeled'}</span>
                  <button key="restore" ref={el => { dangerButtons.current.set(q.id, el) }}
                    className="btn btn--secondary btn--micro" onClick={() => onRestore(q.id)}>Restore</button>
                </>
              ) : (
                <>
                  {/* keyed on the saved labels so a refreshed bank re-seeds the toggles */}
                  <LabelControl key={`${q.labelAnswerable}/${q.labelCorrectAnswer}/${q.labelUnambiguous}`}
                    question={q} onSave={onLabel} />
                  <div className="qcard-danger">
                    {armed === q.id ? (
                      <>
                        {/* keyed apart from Retire and Restore: an unkeyed fragment reconciles
                            child-for-child by position, so confirm would inherit Retire's host
                            node and the focus sitting on it, and a held Enter would retire */}
                        <button key="confirm" className="btn btn--danger btn--micro"
                          onClick={() => onRetire(q.id)}>Confirm retire</button>
                        {/* Cancel goes last: it sits on the pixels Retire just gave up, so the
                            second click of an accidental double cancels rather than confirms */}
                        <button key="cancel" ref={cancelButton} className="btn btn--secondary btn--micro"
                          onClick={() => { setArmed(null); pendingFocus.current = q.id }}>Cancel</button>
                      </>
                    ) : (
                      <button key="retire" ref={el => { dangerButtons.current.set(q.id, el) }}
                        className="ghost-danger" onClick={() => setArmed(q.id)}>Retire</button>
                    )}
                  </div>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Toggle({ label, checked, disabled, onChange }: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="toggle">
      <input className="visually-hidden" type="checkbox" checked={checked} disabled={disabled}
        onChange={e => onChange(e.target.checked)} />
      <svg className="toggle-check" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
        strokeWidth="2" aria-hidden="true"><path d="m2.5 7.5 3 3 6-6.5" /></svg>
      {label}
    </label>
  )
}

function LabelControl({ question, onSave }: {
  question: Question
  onSave: (qid: number, body: LabelBody) => Promise<boolean>
}) {
  // an unlabelled question comes back with all three null: default those to checked, but never
  // default over a stored false, or re-saving would overwrite the label the eval report counts
  const [answerable, setAnswerable] = useState(question.labelAnswerable ?? true)
  const [correctAnswer, setCorrectAnswer] = useState(question.labelCorrectAnswer ?? true)
  const [unambiguous, setUnambiguous] = useState(question.labelUnambiguous ?? true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(labelled(question))

  return (
    <div className="qcard-labels">
      <Toggle label="Answerable" checked={answerable} disabled={saving}
        onChange={v => { setAnswerable(v); setSaved(false) }} />
      <Toggle label="Correct" checked={correctAnswer} disabled={saving}
        onChange={v => { setCorrectAnswer(v); setSaved(false) }} />
      <Toggle label="Unambiguous" checked={unambiguous} disabled={saving}
        onChange={v => { setUnambiguous(v); setSaved(false) }} />
      {saved ? (
        <span className="count">labeled</span>
      ) : (
        <button className="btn btn--secondary btn--micro" disabled={saving} onClick={async () => {
          setSaving(true)
          const ok = await onSave(question.id, { answerable, correctAnswer, unambiguous })
          setSaving(false)
          setSaved(ok)
        }}>Save labels</button>
      )}
    </div>
  )
}
