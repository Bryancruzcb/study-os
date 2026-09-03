import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
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
  return (
    <BrowserRouter>
      <div className="app">
        <aside className="rail">
          <div className="brand">
            <span className="brand-glyph" aria-hidden="true">S</span>
            <h1 className="brand-name">Study OS</h1>
          </div>
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
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
