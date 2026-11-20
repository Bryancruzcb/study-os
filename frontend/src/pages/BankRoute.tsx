import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Outlet, useLocation, useOutletContext, useSearchParams } from 'react-router-dom'
import { api, type ConceptWithQuestions, type Lecture } from '../api'
import Icon from '../icons'
import { lectureName } from '../lectures'
import { plural } from '../plural'
import type { CourseContext } from '../shell/CourseLayout'
import Loading, { SkLine } from '../shell/Loading'
import { LECTURE_ACCEPT, LECTURE_KINDS, type IngestPhase } from '../uploads'

export interface BankContext extends CourseContext {
  bank: ConceptWithQuestions[] | null
  reload: () => Promise<void>
  setError: (e: string | null) => void
}

const row = ({ isActive }: { isActive: boolean }) => `crow${isActive ? ' is-current' : ''}`

type GenerateTypes = 'MC' | 'SHORT_ANSWER' | 'BOTH'

/* the concept ids a hand-off put in ?concepts=1,2,3, dropping anything that is not an id */
function handedOff(raw: string | null): number[] {
  if (!raw) return []
  return raw.split(',').map(s => Number(s)).filter(n => Number.isFinite(n) && n > 0)
}

/* Owns the bank for both panes, so picking a concept never refetches; retire, restore
   and an ingest do. Draws the concept list on the left and the open concept on the
   right, and nothing above them: the questions are what the tab is for. Generating more
   questions and managing lectures are rarer jobs, so each sits closed at the top of the
   list and opens in place there. The upload control lives in the course head's slot; the
   ingest it starts lives in the course context, so it outlives this tab. */
export default function BankRoute() {
  const ctx = useOutletContext<CourseContext>()
  const { course, slot, ingest, refresh } = ctx
  const [bank, setBank] = useState<ConceptWithQuestions[] | null>(null)
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [ownError, setOwnError] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [picked, setPicked] = useState<Set<number>>(() => new Set(handedOff(searchParams.get('concepts'))))
  // a hand-off from the quiz arrives wanting the form, so it opens with its concepts checked
  const [generateOpen, setGenerateOpen] = useState(() => handedOff(searchParams.get('concepts')).length > 0)
  const [lecturesOpen, setLecturesOpen] = useState(false)
  const [count, setCount] = useState(5)
  const [types, setTypes] = useState<GenerateTypes>('BOTH')
  const [generating, setGenerating] = useState(false)
  // one alert for the bank's own failures and the ingest's; an action's fresh start
  // clears both, the way it did when one state held them
  const { clearError } = ingest
  const setError = useCallback((e: string | null) => {
    setOwnError(e)
    if (e == null) clearError()
  }, [clearError])
  const error = ownError ?? ingest.error
  const detail = useRef<HTMLElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  const reload = useCallback(async () => {
    try {
      const [nextBank, nextLectures] = await Promise.all([api.bank(course.id), api.lectures(course.id)])
      setBank(nextBank)
      setLectures(nextLectures)
    } catch (e) {
      setError(String(e))
    }
  }, [course.id, setError])

  // the mount load, and again whenever an ingest finishes, on this tab or while another was open
  useEffect(() => {
    // reload sets state only after its await; the rule cannot see through the callback
    // oxlint-disable-next-line react/set-state-in-effect
    reload()
  }, [reload, ingest.finished])

  // quiz (and anything else) can hand off with ?concepts=1,2,3 already checked for generate.
  // The state above already took them in, so the query has done its job and goes
  useEffect(() => {
    if (!searchParams.has('concepts')) return
    const next = new URLSearchParams(searchParams)
    next.delete('concepts')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  // a deep link, a reload or a cross-document Back opens the concept on the right while the
  // sticky list still sits at its top, so on a real bank the filled row can be thousands of
  // pixels down. nearest: a row the user just clicked is already in view and nothing moves
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('.crow.is-current')?.scrollIntoView?.({ block: 'nearest' })
  }, [bank, pathname])

  function onUpload(files: readonly File[]) {
    setOwnError(null)
    ingest.upload(files)
  }

  async function onDeleteLecture(id: number) {
    setError(null)
    try {
      await api.deleteLecture(id)
      await reload()
      await refresh()
    } catch (e) {
      setError(String(e))
    }
  }

  function toggle(id: number) {
    setPicked(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // what generate would send: the checked ids this bank still has. A hand-off can name a
  // concept that is gone, and a delete can take one away while it is checked
  const chosen = useMemo(() => {
    const known = new Set(bank?.map(c => c.id) ?? [])
    return [...picked].filter(id => known.has(id))
  }, [bank, picked])
  const canGenerate = chosen.length > 0 && count >= 1 && count <= 20 && !generating && !ingest.uploading

  async function onGenerate() {
    if (!canGenerate) return
    setGenerating(true)
    setError(null)
    try {
      await api.generateMore(course.id, { conceptIds: chosen, count, types })
      await reload()
      await refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerating(false)
    }
  }

  const allIds = useMemo(() => bank?.map(c => c.id) ?? [], [bank])
  const canPick = generateOpen && bank != null && bank.length > 0

  return (
    <>
      {slot && createPortal(
        <>
          <label className="btn upload">
            {/* several at once: each file becomes its own lecture, uploaded one after another.
                Files dropped anywhere on the course page join the same queue */}
            <input className="visually-hidden" type="file" accept={LECTURE_ACCEPT} multiple disabled={ingest.uploading}
              onChange={e => {
                const files = Array.from(e.target.files ?? [])
                e.target.value = ''
                if (files.length > 0) onUpload(files)
              }} />
            {/* a live region: the swap to Ingesting… and back is the only sign that an ingest
                started or finished, and a text swap on a disabled control is otherwise silent */}
            <span role="status">{uploadLabel(ingest.phase)}</span>
          </label>
          <small className="hint">
            {ingest.current
              ? `${ingest.current}${ingest.waiting > 0 ? ` · ${ingest.waiting} more after it` : ''}`
              : `${LECTURE_KINDS} · or drop files anywhere · same name replaces`}
          </small>
        </>,
        slot,
      )}
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="split">
        <div className="clist" ref={list}>
          {/* a real bank puts a few hundred rows between the head and the open concept; the
              keyboard gets a way past them. The hash does the work without a script, the
              handler makes sure the caret lands whatever the browser does with a fragment */}
          <a className="skip" href="#concept" onClick={() => detail.current?.focus()}>Skip to the open concept</a>
          <div className="clist-top">
            {bank
              ? <p className="clist-head">{plural(bank.length, 'concept')}</p>
              : <Loading as="p" what="concepts" className="clist-head"><SkLine w="short" /></Loading>}
            <div className="clist-tools">
              {bank && bank.length > 0 && (
                <button type="button" className="disclose" aria-expanded={generateOpen} aria-controls="bank-generate"
                  onClick={() => setGenerateOpen(open => !open)}>
                  Generate more questions<Icon name="chevron-right" size={16} />
                </button>
              )}
              {lectures.length > 0 && (
                <button type="button" className="disclose" aria-expanded={lecturesOpen} aria-controls="bank-lectures"
                  onClick={() => setLecturesOpen(open => !open)}>
                  Lectures ({lectures.length})<Icon name="chevron-right" size={16} />
                </button>
              )}
            </div>
          </div>
          {canPick && (
            <section id="bank-generate" className="bank-generate" aria-label="Generate more questions">
              <p className="lede">
                Check concepts in the list. New questions stay under them and use only what
                those decks already taught.
              </p>
              <div className="bank-generate-row">
                <label className="field">
                  <span className="field-label">Count</span>
                  <input className="input" type="number" min={1} max={20} value={count}
                    disabled={generating}
                    onChange={e => setCount(Number(e.target.value) || 1)} />
                </label>
                <fieldset className="quiz-fieldset bank-generate-types">
                  <legend className="field-label">Types</legend>
                  <div className="chips">
                    {([
                      ['BOTH', 'Both'],
                      ['MC', 'MC'],
                      ['SHORT_ANSWER', 'Short answer'],
                    ] as const).map(([value, label]) => (
                      <label key={value} className="toggle">
                        <input type="radio" name="bank-generate-types" className="visually-hidden"
                          checked={types === value} disabled={generating}
                          onChange={() => setTypes(value)} />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              <div className="bank-generate-actions">
                <button type="button" className="btn btn--ghost btn--micro"
                  disabled={generating || allIds.length === 0}
                  onClick={() => setPicked(new Set(allIds))}>All concepts</button>
                <button type="button" className="btn btn--ghost btn--micro"
                  disabled={generating || chosen.length === 0}
                  onClick={() => setPicked(new Set())}>None</button>
                <button type="button" className="btn btn--micro" disabled={!canGenerate} onClick={onGenerate}>
                  {generating ? 'Generating…' : `Generate · ${plural(count, 'question')}`}
                </button>
              </div>
            </section>
          )}
          {lecturesOpen && lectures.length > 0 && (
            <ul id="bank-lectures" className="lecture-manage" aria-label="Lectures">
              {lectures.map(lecture => (
                <LectureDelete key={lecture.id} lecture={lecture} courseName={course.name} disabled={ingest.uploading || generating}
                  onDelete={() => onDeleteLecture(lecture.id)} />
              ))}
            </ul>
          )}
          <nav aria-label="Concepts">
            {!bank && (
              <Loading what="the concept list">
                <div className="sk-stack">
                  {Array.from({ length: 6 }, (_, i) => <SkLine key={i} tall />)}
                </div>
              </Loading>
            )}
            {/* opening a row hands the caret to the open concept, so its cards are one Tab away
                instead of the rest of the list. preventScroll keeps a mouse click from jumping
                the page, and a pointer-started focus draws no ring. The checkboxes that pick
                concepts for generating show only while that form is open */}
            {bank?.map(c => (
              <div key={c.id} className="crow-wrap">
                {canPick && (
                  <label className="crow-check">
                    <input type="checkbox" checked={picked.has(c.id)} disabled={generating}
                      aria-label={`Generate for ${c.name}`}
                      onChange={() => toggle(c.id)} />
                  </label>
                )}
                <NavLink className={row} to={String(c.id)}
                  onClick={() => detail.current?.focus({ preventScroll: true })}>
                  <span className="crow-name">{c.name}</span>
                  <span className="count">{c.questions.filter(q => q.status === 'ACTIVE').length}</span>
                </NavLink>
              </div>
            ))}
          </nav>
        </div>
        <section className="detail" id="concept" tabIndex={-1} ref={detail}>
          <Outlet context={{ ...ctx, bank, reload, setError } satisfies BankContext} />
        </section>
      </div>
    </>
  )
}

function uploadLabel(phase: IngestPhase): string {
  switch (phase) {
    case 'uploading': return 'Uploading…'
    case 'processing': return 'Ingesting…'
    case 'waiting': return 'Waiting…'
    case 'idle': return 'Add a lecture'
  }
}

/* one lecture with a delete that arms first, matching the exam form's confirm pattern */
function LectureDelete({ lecture, courseName, disabled, onDelete }: {
  lecture: Lecture
  courseName: string
  disabled: boolean
  onDelete: () => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  return (
    <li className="lecture-manage-row">
      <span className="lecture-manage-name">
        {lectureName(lecture.filename, courseName, lecture.lectureTitle, lecture.topics)}
      </span>
      <span className="count">{plural(lecture.concepts, 'topic')}</span>
      {confirming ? (
        <>
          <button key="confirm" className="btn btn--danger btn--micro" type="button" disabled={busy || disabled}
            onClick={async () => {
              setBusy(true)
              await onDelete()
              setBusy(false)
            }}>Confirm delete</button>
          <button key="cancel" className="btn btn--secondary btn--micro" type="button" disabled={busy}
            onClick={() => setConfirming(false)}>Cancel</button>
        </>
      ) : (
        <button key="delete" className="btn btn--ghost btn--micro" type="button" disabled={busy || disabled}
          onClick={() => setConfirming(true)}>Delete</button>
      )}
    </li>
  )
}
