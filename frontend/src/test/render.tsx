import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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
