import { useCallback, useEffect, useState } from 'react'
import { api, type CourseOverview } from '../api'

export interface CoursesState {
  courses: CourseOverview[] | null
  error: string | null
  refresh: () => Promise<void>
}

/* Every course with its counts. null until the first load lands; error is only ever
   the first load's, because a refresh that fails should keep the numbers it had: a
   stale figure beats a torn-down page. */
export function useCourses(): CoursesState {
  const [courses, setCourses] = useState<CourseOverview[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.overview().then(setCourses).catch(e => setError(String(e)))
  }, [])

  const refresh = useCallback(
    () => api.overview().then(setCourses).catch(() => undefined),
    [],
  )

  return { courses, error, refresh }
}
