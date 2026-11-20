import { useEffect, useRef, useState } from 'react'

/* A drag from the desktop lists "Files" in its types; dragging text or a link on the page
   does not, and those are left to the browser. Takes a window DragEvent or React's. */
export function carriesFiles(e: { dataTransfer: DataTransfer | null }): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

/* true while a file drag is over the window. dragenter and dragleave fire in pairs for every
   element the pointer crosses, so the drag is over the window while more enters than leaves
   have been seen; a drop anywhere ends it. Nothing here takes the drop: a page whose drop
   targets are its own elements (the home page's course tiles) uses this alone. */
export function useFileDragging(): boolean {
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let depth = 0
    const enter = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      depth += 1
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const end = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      depth = 0
      setDragging(false)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', end)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', end)
    }
  }, [])

  return dragging
}

/* While mounted, files dragged anywhere over the window can be dropped. dragging is true while
   a file drag is over the page, and a drop hands its files to onFiles. The listeners sit on the
   window, so a drop that misses every element still lands here instead of the browser opening
   the file in place of the app; they come off on unmount. */
export function useFileDrop(onFiles: (files: File[]) => void): boolean {
  const dragging = useFileDragging()
  const latest = useRef(onFiles)
  useEffect(() => {
    latest.current = onFiles
  }, [onFiles])

  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const drop = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length > 0) latest.current(files)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])

  return dragging
}

/* Outside a course a dropped file has nowhere to go, and the browser's own answer is to open
   it in place of the app. This keeps the app and shows the drop as not allowed. A page that
   takes drops (useFileDrop) allows it again whichever listener runs first: its dragover sets
   copy after this one, or runs before and marks the event handled so this one stays out. A drop
   target on an element (a home tile) marks the event handled before it reaches the window. */
export function useFileDropGuard(): void {
  useEffect(() => {
    const refuse = (e: DragEvent) => {
      if (!carriesFiles(e) || e.defaultPrevented) return
      e.preventDefault()
      if (e.type === 'dragover' && e.dataTransfer) e.dataTransfer.dropEffect = 'none'
    }
    window.addEventListener('dragover', refuse)
    window.addEventListener('drop', refuse)
    return () => {
      window.removeEventListener('dragover', refuse)
      window.removeEventListener('drop', refuse)
    }
  }, [])
}
