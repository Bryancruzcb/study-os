import { useEffect, useId, useState } from 'react'

type Mermaid = (typeof import('mermaid'))['default']

/* mermaid is by far the heaviest thing the app ships and only a question with a diagram
   needs it, so it loads with the first diagram on screen, once */
let loading: Promise<Mermaid> | null = null

function loadMermaid(): Promise<Mermaid> {
  loading ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', fontFamily: 'inherit' })
    return mermaid
  })
  return loading
}

/* A diagram written as Mermaid source, drawn to SVG. Strict security leaves scripts and
   links out of what it draws. A source that will not parse draws nothing, rather than
   mermaid's error graphic: the explanation beside it stands on its own. */
export default function Diagram({ source, label }: { source: string; label: string }) {
  // a render id has to be a valid element id, and useId's has punctuation in it
  const id = `diagram-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [drawn, setDrawn] = useState<{ source: string; svg: string } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    loadMermaid()
      .then(async mermaid => {
        if (!(await mermaid.parse(source, { suppressErrors: true }))) throw new Error('the diagram does not parse')
        return mermaid.render(id, source)
      })
      .then(({ svg }) => { if (current) setDrawn({ source, svg }) })
      .catch(() => { if (current) setFailed(source) })
    return () => { current = false }
  }, [id, source])

  if (failed === source) return null
  return (
    <figure className="diagram" aria-label={label}>
      {drawn?.source === source
        ? <div className="diagram-art" dangerouslySetInnerHTML={{ __html: drawn.svg }} />
        : <p className="empty">Drawing the diagram…</p>}
    </figure>
  )
}
