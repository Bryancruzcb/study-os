import { Navigate, useLocation, useOutletContext } from 'react-router-dom'
import type { BankContext } from './BankRoute'

/* /bank on its own: open the first concept, or say what to do when there is none yet */
export default function BankPage() {
  const { bank } = useOutletContext<BankContext>()
  // keyed on the location: a second click on the Bank tab that lands before the redirect
  // commits leaves this page mounted at the bare path under a new location, with the same
  // Navigate, whose effect would never fire again. A new key remounts it, and it fires
  const { key } = useLocation()
  if (!bank) return <p className="empty">Loading…</p>
  if (bank.length === 0) {
    return (
      <div className="bank-empty">
        <p className="empty">No concepts yet. Upload a lecture PDF to build the bank.</p>
      </div>
    )
  }
  return <Navigate key={key} to={String(bank[0].id)} replace />
}
