import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import CourseLayout from './shell/CourseLayout'
import Frame from './shell/Frame'
import BankConceptPage from './pages/BankConceptPage'
import BankPage from './pages/BankPage'
import BankRoute from './pages/BankRoute'
import DashboardPage from './pages/DashboardPage'
import EvalPage from './pages/EvalPage'
import HomePage from './pages/HomePage'
import StudyPage from './pages/StudyPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route element={<Frame />}>
          <Route path="/courses/:courseId" element={<CourseLayout />}>
            <Route index element={<Navigate to="study" replace />} />
            <Route path="study" element={<StudyPage />} />
            <Route path="bank" element={<BankRoute />}>
              <Route index element={<BankPage />} />
              <Route path=":conceptId" element={<BankConceptPage />} />
            </Route>
            <Route path="dashboard" element={<DashboardPage />} />
          </Route>
          <Route path="/eval" element={<EvalPage />} />
        </Route>
        {/* the old top-level /study, /bank and /dashboard, and anything else, land on the grid */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
