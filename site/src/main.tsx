import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

const root = document.getElementById('root')!
const app = (
  <StrictMode>
    <App />
  </StrictMode>
)

// The production build pre-renders the page into #root (scripts/prerender.mjs), so the content
// is there without JavaScript; hydrate it. In `npm run dev` the root is empty: render.
if (root.firstElementChild) hydrateRoot(root, app)
else createRoot(root).render(app)
