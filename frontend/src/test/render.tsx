import { render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom'
import BankConceptPage from '../pages/BankConceptPage'
import BankPage from '../pages/BankPage'
import BankRoute from '../pages/BankRoute'
import CourseLayout from '../shell/CourseLayout'

/* a page under the course shell at /courses/<id>/<tab>: the layout fetches api.overview,
   which every test file mocks, and hands the course to the page */
export function renderInCourse(page: ReactElement, tab: string, courseId = 1) {
  return render(
    <MemoryRouter initialEntries={[`/courses/${courseId}/${tab}`]}>
      <Routes>
        <Route path="/courses/:courseId" element={<CourseLayout />}>
          <Route path={tab} element={page} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

function bankRoutes(otherTabs?: ReactNode) {
  return (
    <Routes>
      <Route path="/courses/:courseId" element={<CourseLayout />}>
        {otherTabs}
        <Route path="bank" element={<BankRoute />}>
          <Route index element={<BankPage />} />
          <Route path=":conceptId" element={<BankConceptPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

/* the bank's split view under the course shell, at the given path; otherTabs adds sibling
   routes for a test that leaves the bank and comes back */
export function renderBank(path: string, otherTabs?: ReactNode) {
  return render(<MemoryRouter initialEntries={[path]}>{bankRoutes(otherTabs)}</MemoryRouter>)
}

/* the same split view under the real history, for a test that counts its entries */
export function renderBankInBrowser(path: string) {
  window.history.replaceState(null, '', path)
  return render(<BrowserRouter>{bankRoutes()}</BrowserRouter>)
}
