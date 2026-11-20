import { useEffect, useState, type ReactNode } from 'react'

/* A load faster than this is over before a skeleton would register, so it only flashes */
export const SKELETON_DELAY_MS = 150

/* false for the first `ms` after mounting, then true */
function useElapsed(ms: number): boolean {
  const [elapsed, setElapsed] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setElapsed(true), ms)
    return () => clearTimeout(timer)
  }, [ms])
  return elapsed
}

/* A region whose data is still on its way. Screen readers and tests always get "Loading
   <what>…"; the skeleton, shaped like the loaded layout and passed as children, appears only
   if the wait outlasts SKELETON_DELAY_MS. Mount it only while loading, so the clock starts
   with the wait. */
export default function Loading({ what, as: Tag = 'div', className, children }: {
  what: string
  as?: 'div' | 'p'
  className?: string
  children?: ReactNode
}) {
  const late = useElapsed(SKELETON_DELAY_MS)
  return (
    <Tag className={className} aria-busy="true">
      <span className="visually-hidden">{`Loading ${what}…`}</span>
      {late && children}
    </Tag>
  )
}

/* the building blocks of a skeleton: a line of text and a block, sized by modifier classes in
   base.css so each screen can match its own layout */
export function SkLine({ w = 'full', tall = false }: { w?: 'full' | 'long' | 'mid' | 'short'; tall?: boolean }) {
  return <span className={`skeleton sk-line sk-w-${w}${tall ? ' sk-line--tall' : ''}`} aria-hidden="true" />
}

export function SkBlock({ h = 'md' }: { h?: 'sm' | 'md' | 'lg' }) {
  return <span className={`skeleton sk-block sk-h-${h}`} aria-hidden="true" />
}
