import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import BankPage from './pages/BankPage'

export default function App() {
  return (
    <BrowserRouter>
      <h1>Study OS</h1>
      <nav><Link to="/">Bank</Link></nav>
      <Routes>
        <Route path="/" element={<BankPage />} />
      </Routes>
    </BrowserRouter>
  )
}
