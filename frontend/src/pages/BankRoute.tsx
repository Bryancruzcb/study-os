import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom'
import { api, type ConceptWithQuestions } from '../api'
import { plural } from '../plural'
import type { CourseContext } from '../shell/CourseLayout'

export interface BankContext extends CourseContext {
  bank: ConceptWithQuestions[] | null
  reload: () => Promise<void>
  setError: (e: string | null) => void
}

const row = ({ isActive }: { isActive: boolean }) => `crow${isActive ? ' is-current' : ''}`

/* Owns the bank for both panes, so picking a concept never refetches; retire, restore
   and an ingest do. Draws the concept list on the left and the open concept on the
   right. The upload control lives in the course head's slot; the ingest it starts lives
   in the course context, so it outlives this tab. */
export default function BankRoute() {
  const ctx = useOutletContext<CourseContext>()
  const { course, slot, ingest } = ctx
  const [bank, setBank] = useState<ConceptWithQuestions[] | null>(null)
  const [ownError, setOwnError] = useState<string | null>(null)
  // one alert for the bank's own failures and the ingest's; an action's fresh start
  // clears both, the way it did when one state held them
  const { clearError } = ingest
  const setError = useCallback((e: string | null) => {
    setOwnError(e)
    if (e == null) clearError()
  }, [clearError])
  const error = ownError ?? ingest.error
  const detail = useRef<HTMLElement>(null)
  const list = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  const reload = useCallback(async () => {
    try {
      setBank(await api.bank(course.id))
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

  // a deep link, a reload or a cross-document Back opens the concept on the right while the
  // sticky list still sits at its top, so on a real bank the filled row can be thousands of
  // pixels down. nearest: a row the user just clicked is already in view and nothing moves
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('.crow.is-current')?.scrollIntoView?.({ block: 'nearest' })
  }, [bank, pathname])

  function onUpload(file: File) {
    setOwnError(null)
    return ingest.upload(file)
  }

  return (
    <>
      {slot && createPortal(
        <>
          <label className="btn upload">
            {/* the extension keeps a .pptx out of the default picker; the mime type alone
                does not, because the OS file dialog matches on either */}
            <input className="visually-hidden" type="file" accept=".pdf,application/pdf" disabled={ingest.uploading}
              onChange={e => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) onUpload(file)
              }} />
            {/* a live region: the swap to Ingesting… and back is the only sign that an ingest
                started or finished, and a text swap on a disabled control is otherwise silent */}
            <span role="status">{ingest.uploading ? 'Ingesting…' : 'Upload a lecture PDF'}</span>
          </label>
          <small className="hint">PDF only</small>
        </>,
        slot,
      )}
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="split">
        <nav className="clist" aria-label="Concepts" ref={list}>
          {/* a real bank puts a few hundred rows between the head and the open concept; the
              keyboard gets a way past them. The hash does the work without a script, the
              handler makes sure the caret lands whatever the browser does with a fragment */}
          <a className="skip" href="#concept" onClick={() => detail.current?.focus()}>Skip to the open concept</a>
          <p className="clist-head">{bank ? plural(bank.length, 'concept') : 'Loading…'}</p>
          {/* opening a row hands the caret to the open concept, so its cards are one Tab away
              instead of the rest of the list. preventScroll keeps a mouse click from jumping
              the page, and a pointer-started focus draws no ring */}
          {bank?.map(c => (
            <NavLink key={c.id} className={row} to={String(c.id)}
              onClick={() => detail.current?.focus({ preventScroll: true })}>
              <span className="crow-name">{c.name}</span>
              <span className="count">{c.questions.filter(q => q.status === 'ACTIVE').length}</span>
            </NavLink>
          ))}
        </nav>
        <section className="detail" id="concept" tabIndex={-1} ref={detail}>
          <Outlet context={{ ...ctx, bank, reload, setError } satisfies BankContext} />
        </section>
      </div>
    </>
  )
}
