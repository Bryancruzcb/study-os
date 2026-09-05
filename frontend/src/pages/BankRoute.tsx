import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Outlet, useOutletContext } from 'react-router-dom'
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
   and an upload do. Draws the concept list on the left and the open concept on the
   right. The upload control lives in the course head's slot. */
export default function BankRoute() {
  const ctx = useOutletContext<CourseContext>()
  const { course, refresh, slot } = ctx
  const [bank, setBank] = useState<ConceptWithQuestions[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setBank(await api.bank(course.id))
    } catch (e) {
      setError(String(e))
    }
  }, [course.id])

  useEffect(() => {
    // reload sets state only after its await; the rule cannot see through the callback
    // oxlint-disable-next-line react/set-state-in-effect
    reload()
  }, [reload])

  async function onUpload(file: File) {
    setUploading(true)
    setError(null)
    try {
      const m = await api.upload(course.id, file)
      if (m.status === 'FAILED') setError(m.errorMessage ?? 'Ingest failed')
      await reload()
      // the course head's concept and question counts just moved
      await refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      {slot && createPortal(
        <>
          <label className="btn upload">
            {/* the extension keeps a .pptx out of the default picker; the mime type alone
                does not, because the OS file dialog matches on either */}
            <input className="visually-hidden" type="file" accept=".pdf,application/pdf" disabled={uploading}
              onChange={e => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) onUpload(file)
              }} />
            {uploading ? 'Ingesting…' : 'Upload a lecture PDF'}
          </label>
          <small className="hint">PDF only</small>
        </>,
        slot,
      )}
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="split">
        <nav className="clist" aria-label="Concepts">
          <p className="clist-head">{bank ? plural(bank.length, 'concept') : 'Loading…'}</p>
          {bank?.map(c => (
            <NavLink key={c.id} className={row} to={String(c.id)}>
              <span className="crow-name">{c.name}</span>
              <span className="count">{c.questions.filter(q => q.status === 'ACTIVE').length}</span>
            </NavLink>
          ))}
        </nav>
        <section className="detail">
          <Outlet context={{ ...ctx, bank, reload, setError } satisfies BankContext} />
        </section>
      </div>
    </>
  )
}
