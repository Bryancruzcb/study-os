import { useLayoutEffect, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { api, type ConceptWithQuestions, type Question } from '../api'
import { messageOf } from '../errors'
import Icon from '../icons'
import { conceptLectureNames, lectureOf } from '../lectures'
import { letter } from '../letter'
import { plural } from '../plural'
import type { BankContext } from './BankRoute'
import Loading, { SkBlock, SkLine } from '../shell/Loading'
import { citation, slides } from '../source'

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

/* the open concept before the bank arrives: the name, then a card or two */
export function ConceptSkeleton() {
  return (
    <Loading what="the concept">
      <div className="sk-stack">
        <SkLine w="mid" tall />
        <SkBlock h="md" />
        <SkBlock h="md" />
      </div>
    </Loading>
  )
}

export default function BankConceptPage() {
  const { conceptId } = useParams()
  const { course, bank, reload, refresh, setError } = useOutletContext<BankContext>()
  if (!bank) return <ConceptSkeleton />
  const concept = bank.find(c => c.id === Number(conceptId))
  // the list is right there, so a bad id needs no way back, only the word
  if (!concept) return <p className="alert" role="alert">No concept has id {conceptId}.</p>
  // the lecture by the name the bank's lecture list gives it, from all of that lecture's concepts
  const lecture = lectureOf(concept, conceptLectureNames(bank, course.name), course.name)
  // keyed, so the arming and the focus bookkeeping start over when the concept changes
  return <ConceptCards key={concept.id} concept={concept} lecture={lecture} reload={reload} refresh={refresh} setError={setError} />
}

function ConceptCards({ concept, lecture, reload, refresh, setError }: {
  concept: ConceptWithQuestions
  lecture: string | null
  reload: () => Promise<void>
  refresh: () => Promise<void>
  setError: (e: string | null) => void
}) {
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
      setError(messageOf(e))
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
      setError(messageOf(e))
    }
  }

  const active = concept.questions.filter(q => q.status === 'ACTIVE').length
  const retired = concept.questions.length - active
  const source = citation(lecture, concept.sourcePages)

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
            className={`qcard${q.status === 'RETIRED' ? ' qcard--retired' : ''}`}>
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
                  <span className="qcard-note mark" tabIndex={-1} ref={el => { marks.current.set(q.id, el) }}>
                    Won’t come up in study or quizzes
                  </span>
                  <button key="restore" ref={el => { dangerButtons.current.set(q.id, el) }}
                    className="btn btn--secondary btn--micro" onClick={() => onRestore(q.id)}>Restore</button>
                </>
              ) : (
                <>
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
