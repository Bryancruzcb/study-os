import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import BankPage from './pages/BankPage'
import StudyPage from './pages/StudyPage'

export default function App() {
  return (
    <BrowserRouter>
      <h1>Study OS</h1>
      <nav><Link to="/">Bank</Link> | <Link to="/study">Study</Link></nav>
      <Routes>
        <Route path="/" element={<BankPage />} />
        <Route path="/study" element={<StudyPage />} />
      </Routes>
    </BrowserRouter>
  )
}
