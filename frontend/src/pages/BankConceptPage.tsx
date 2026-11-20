import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useOutletContext, useParams } from 'react-router-dom'
import { api, type ConceptWithQuestions, type Question } from '../api'
import Icon from '../icons'
import { letter } from '../letter'
import { plural } from '../plural'
import type { BankContext } from './BankRoute'
import { citation, slides } from '../source'

interface LabelBody { answerable: boolean; correctAnswer: boolean; unambiguous: boolean }
/* the labels as stored: null where nobody has judged that check yet */
type SavedLabels = { [K in keyof LabelBody]: boolean | null }

const storedLabels = (q: Question): SavedLabels =>
  ({ answerable: q.labelAnswerable, correctAnswer: q.labelCorrectAnswer, unambiguous: q.labelUnambiguous })

/* the saved labels in one short line, or null when none is set: "Labeled: answerable · not
   correct · unambiguous". Each check is named either way, so the line never leans on colour */
function labelLine(labels: SavedLabels): string | null {
  const parts = [
    labels.answerable == null ? null : labels.answerable ? 'answerable' : 'not answerable',
    labels.correctAnswer == null ? null : labels.correctAnswer ? 'correct' : 'not correct',
    labels.unambiguous == null ? null : labels.unambiguous ? 'unambiguous' : 'ambiguous',
  ].filter((part): part is string => part != null)
  return parts.length > 0 ? `Labeled: ${parts.join(' · ')}` : null
}

/* an MC question's options, in order. A value that is not a string is shown as written
   rather than dropped, so every option keeps its letter and the key still points at it */
function optionsOf(q: Question): string[] {
  if (q.type !== 'MC' || !q.optionsJson) return []
  try {
    const parsed: unknown = JSON.parse(q.optionsJson)
    return Array.isArray(parsed) ? parsed.map(o => String(o)) : []
  } catch {
    return []
  }
}

/* The bank sends each question whole, its model answer included, but the Question type the
   other pages share leaves the field out. Read it here, checked, rather than widen that type */
function modelAnswerOf(q: Question): string | null {
  const value: unknown = (q as Question & { modelAnswer?: unknown }).modelAnswer
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

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
  // a link from the evaluation page names one question: its card comes into view, marked, so the
  // question that failed a check is the one the eye lands on
  const { hash } = useLocation()
  const target = hash.startsWith('#question-') ? Number(hash.slice('#question-'.length)) : null
  useEffect(() => {
    if (target == null) return
    // jsdom has no scrollIntoView
    document.getElementById(`question-${target}`)?.scrollIntoView?.({ block: 'center' })
  }, [target])

  // the question whose retire is armed, or null. one at a time, so arming a card takes
  // the arming away from whichever card held it and only one confirm is ever on screen
  const [armed, setArmed] = useState<number | null>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  // the danger cell's button per question, so the caret can be put back on the card it
  // was working when cancel or restore unmounts the control it was sitting on
  const dangerButtons = useRef(new Map<number, HTMLButtonElement | null>())
  // the struck card's mark per question: where the caret lands after a confirm. Not on
  // Restore, which takes Retire's place: a held Enter on Confirm would run on into it and
  // undo the retire. From the mark, Restore is one Tab away
  const marks = useRef(new Map<number, HTMLSpanElement | null>())
  // a ref, not state: this is a one-shot command to the DOM after the next render
  const pendingFocus = useRef<{ id: number; mark?: boolean } | null>(null)

  // an armed card holds focus on Cancel rather than on the confirm that took Retire's
  // place, so the repeat of a held Enter, or a stuttered second press, disarms the card
  useLayoutEffect(() => {
    if (armed != null) cancelButton.current?.focus()
  }, [armed])

  // runs after whichever render the handler queued, so the caret lands on whatever the
  // cell now holds rather than on document.body
  useLayoutEffect(() => {
    const p = pendingFocus.current
    if (p == null) return
    pendingFocus.current = null
    const target = p.mark ? marks.current.get(p.id) : dangerButtons.current.get(p.id)
    target?.focus()
  })

  async function onRetire(qid: number) {
    // disarming first means a second click of an accidental double lands on Cancel, which
    // takes over the pixels Retire gave up at the card's right edge
    setArmed(null)
    setError(null)
    try {
      await api.retire(qid)
      await reload()
      pendingFocus.current = { id: qid, mark: true }
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
      pendingFocus.current = { id: qid }
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
  const source = citation(concept.lecture, concept.sourcePages)

  return (
    <div className="concept">
      <div className="concept-top">
        <div className="chips">
          {source && <span className="chip chip--mono">{source}</span>}
          <span className="count">{plural(active, 'question')}{retired > 0 && ` · ${retired} retired`}</span>
        </div>
        <h2>{concept.name}</h2>
        <p className="concept-summary">{concept.summary}</p>
      </div>
      <ul className="qcards">
        {concept.questions.map(q => (
          <li id={`question-${q.id}`} key={q.id}
            className={`qcard${q.status === 'RETIRED' ? ' qcard--retired' : ''}${target === q.id ? ' is-target' : ''}`}>
            <div className="chips">
              <span className="chip">{q.type === 'MC' ? 'Multiple choice' : 'Short answer'}</span>
              {q.sourcePages && <span className="chip chip--mono">{slides(q.sourcePages)}</span>}
              {q.status === 'RETIRED' && <span className="chip chip--flag">Retired</span>}
            </div>
            <p className="qcard-prompt">{q.prompt}</p>
            <Answer question={q} />
            <div className="qcard-foot">
              {q.status === 'RETIRED' ? (
                <>
                  <span className="qcard-label-line mark" tabIndex={-1} ref={el => { marks.current.set(q.id, el) }}>
                    {labelLine(storedLabels(q)) ?? 'Not labeled'}
                  </span>
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
                          onClick={() => { setArmed(null); pendingFocus.current = { id: q.id } }}>Cancel</button>
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

/* an unlabelled check defaults to checked, but never over a stored false, or re-saving would
   overwrite the label the eval report counts */
const draftFrom = (labels: SavedLabels): LabelBody => ({
  answerable: labels.answerable ?? true,
  correctAnswer: labels.correctAnswer ?? true,
  unambiguous: labels.unambiguous ?? true,
})

/* The owner's evaluation tool, kept quiet: a Label button that opens the three checks and a
   save, and, once labels are saved, one line saying what they are. The labels feed the
   evaluation page; a student studying from the bank never needs them open. */
function LabelControl({ question, onSave }: {
  question: Question
  onSave: (qid: number, body: LabelBody) => Promise<boolean>
}) {
  const [saved, setSaved] = useState<SavedLabels>(() => storedLabels(question))
  const [draft, setDraft] = useState<LabelBody>(() => draftFrom(storedLabels(question)))
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  // a save closes the checks, which takes the button under the caret away; hand the caret to
  // the line that now says what was saved, so it stays on the card, one Tab from Retire.
  // Only after a save: a card that arrives already labelled must not take the caret on mount
  const mark = useRef<HTMLSpanElement>(null)
  const justSaved = useRef(false)
  useLayoutEffect(() => {
    if (!justSaved.current) return
    justSaved.current = false
    mark.current?.focus()
  }, [saved])

  const line = labelLine(saved)
  const panel = `labels-${question.id}`

  return (
    <div className="qcard-labels">
      <div className="qcard-labels-head">
        <button type="button" className="disclose" aria-expanded={open} aria-controls={panel}
          onClick={() => {
            // closing without a save drops the unsaved changes, so the line and the checks agree
            if (open) setDraft(draftFrom(saved))
            setOpen(!open)
          }}>
          Label<Icon name="chevron-right" size={16} />
        </button>
        {line && <span className="qcard-label-line mark" tabIndex={-1} ref={mark}>{line}</span>}
      </div>
      {open && (
        <div id={panel} className="qcard-label-set" role="group" aria-label="Labels for this question">
          <Toggle label="Answerable" checked={draft.answerable} disabled={saving}
            onChange={v => setDraft(d => ({ ...d, answerable: v }))} />
          <Toggle label="Correct" checked={draft.correctAnswer} disabled={saving}
            onChange={v => setDraft(d => ({ ...d, correctAnswer: v }))} />
          <Toggle label="Unambiguous" checked={draft.unambiguous} disabled={saving}
            onChange={v => setDraft(d => ({ ...d, unambiguous: v }))} />
          <button type="button" className="btn btn--secondary btn--micro" disabled={saving} onClick={async () => {
            setSaving(true)
            const ok = await onSave(question.id, draft)
            setSaving(false)
            if (!ok) return
            justSaved.current = true
            setOpen(false)
            setSaved(draft)
          }}>Save labels</button>
        </div>
      )}
    </div>
  )
}

/* What the question is checked against, so it can be judged from the bank: every option of a
   multiple-choice question with the right one marked by a check and the words, or the model
   answer of a short answer when one was written. */
function Answer({ question }: { question: Question }) {
  const options = optionsOf(question)
  if (options.length > 0) {
    return (
      <ol className="qcard-options" aria-label="Options">
        {options.map((option, i) => {
          const isKey = i === question.correctIndex
          return (
            <li key={i} className={`qcard-option${isKey ? ' is-key' : ''}`}>
              <span className="letter" aria-hidden="true">{isKey ? <Icon name="check" size={16} /> : letter(i)}</span>
              <span className="qcard-option-text">{option}</span>
              {isKey && <span className="qcard-tag">Right answer</span>}
            </li>
          )
        })}
      </ol>
    )
  }
  const model = modelAnswerOf(question)
  if (!model) return null
  return (
    <div className="qcard-key">
      <span className="qcard-key-label"><Icon name="check" size={16} />Model answer</span>
      <p className="qcard-key-text">{model}</p>
    </div>
  )
}
