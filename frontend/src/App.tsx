import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AuthGate from './shell/AuthGate'
import CourseLayout from './shell/CourseLayout'
import Frame from './shell/Frame'
import BankConceptPage from './pages/BankConceptPage'
import BankPage from './pages/BankPage'
import BankRoute from './pages/BankRoute'
import DashboardPage from './pages/DashboardPage'
import HomePage from './pages/HomePage'
import Practice from './pages/Practice'
import QuizPage from './pages/QuizPage'
import StudyPage from './pages/StudyPage'
import { useFileDropGuard } from './shell/fileDrop'
import { UploadQueueProvider } from './shell/UploadQueue'

export default function App() {
  // a file dropped where nothing takes it must not replace the app; a course page and a home tile take drops
  useFileDropGuard()
  return (
    <BrowserRouter>
      <AuthGate>
        {/* one upload queue above every page, so a lecture dropped on home keeps going inside a course */}
        <UploadQueueProvider>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route element={<Frame />}>
              <Route path="/courses/:courseId" element={<CourseLayout />}>
                <Route index element={<Navigate to="study" replace />} />
                {/* one Practice tab, two modes, each at its own address */}
                <Route element={<Practice />}>
                  <Route path="study" element={<StudyPage />} />
                  <Route path="quiz" element={<QuizPage />} />
                </Route>
                <Route path="bank" element={<BankRoute />}>
                  <Route index element={<BankPage />} />
                  <Route path=":conceptId" element={<BankConceptPage />} />
                </Route>
                <Route path="dashboard" element={<DashboardPage />} />
              </Route>
            </Route>
            {/* the old top-level /study, /bank and /dashboard, and anything else, land on the grid */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </UploadQueueProvider>
      </AuthGate>
    </BrowserRouter>
  )
}
