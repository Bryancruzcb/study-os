import { Navigate, useOutletContext } from 'react-router-dom'
import type { BankContext } from './BankRoute'

/* /bank on its own: open the first concept, or say what to do when there is none yet */
export default function BankPage() {
  const { bank } = useOutletContext<BankContext>()
  if (!bank) return <p className="empty">Loading…</p>
  if (bank.length === 0) {
    return (
      <div className="bank-empty">
        <p className="empty">No concepts yet. Upload a lecture PDF to build the bank.</p>
      </div>
    )
  }
  return <Navigate to={String(bank[0].id)} replace />
}
