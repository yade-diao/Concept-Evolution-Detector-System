import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { App } from './App'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('no #root to mount on')

createRoot(root).render(
  <StrictMode>
    {/* The deployment serves this from the root of its own domain, behind a
        proxy that falls back to index.html, so history routing needs no
        basename and no hash. */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
