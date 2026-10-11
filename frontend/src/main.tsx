import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// self-hosted, so nothing loads from a network at runtime: Figtree 400/500/600/700 for the
// interface, and Fraunces (variable weight and optical size) for headings and big numbers
import '@fontsource/figtree/400.css'
import '@fontsource/figtree/500.css'
import '@fontsource/figtree/600.css'
import '@fontsource/figtree/700.css'
import '@fontsource-variable/fraunces/opsz.css'
import './index.css'
import App from './App.tsx'
import { takeInviteFromLink } from './auth'

takeInviteFromLink()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
