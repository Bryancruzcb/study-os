import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// self-hosted, so nothing loads from a network at runtime: Plex Sans 400/500/600,
// Plex Mono 400, and nothing else
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
