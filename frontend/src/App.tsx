import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { api, type EvalReport } from './api'
import BankPage from './pages/BankPage'
import StudyPage from './pages/StudyPage'
import DashboardPage from './pages/DashboardPage'
import EvalPage from './pages/EvalPage'

const sections = [
  { to: '/', label: 'Bank' },
  { to: '/study', label: 'Study' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/eval', label: 'Eval' },
]

export default function App() {
  // The strip is chrome, so a failed load leaves it showing the brand alone rather
  // than raising an alert over whichever page the user actually came for.
  const [report, setReport] = useState<EvalReport | null>(null)
  useEffect(() => {
    api.evalReport().then(setReport).catch(() => setReport(null))
  }, [])

  return (
    <BrowserRouter>
      <div className="app">
        <div className="strip">
          <span className="strip-brand">Study OS</span>
          {report && <span>{report.labeled} labeled</span>}
          {report && <span>{report.gradedShortAnswers} graded</span>}
          {report && report.gradedShortAnswers > 0 &&
            <span className="strip-due">{Math.round(report.graderAgreement * 100)}% agreement</span>}
        </div>
        <aside className="rail">
          <nav className="rail-nav">
            {sections.map(s => (
              <NavLink key={s.to} to={s.to} end
                className={({ isActive }) => `nav-item${isActive ? ' is-current' : ''}`}>
                <span className="nav-tick" aria-hidden="true" />
                <span className="nav-label">{s.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="content">
          <Routes>
            <Route path="/" element={<BankPage />} />
            <Route path="/study" element={<StudyPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/eval" element={<EvalPage />} />
            {/* the bank is at "/", so a bookmarked or hand-typed /bank matched nothing
                and rendered an empty content area next to a working nav */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
