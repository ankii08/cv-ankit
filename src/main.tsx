import { StrictMode, lazy, Suspense } from 'react'
import { hydrateRoot, createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App'
import FloatingChat from './FloatingChat'
import GlobalNav from './GlobalNav'

const OpsDashboard = lazy(() => import('./ops/OpsDashboard'))

function ConditionalNav() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/ops')) return null
  return <GlobalNav />
}

function GlobalChat() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/ops')) return null
  return <FloatingChat />
}

function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="text-center">
        <p className="font-display text-7xl font-bold text-primary">404</p>
        <h1 className="font-display text-2xl font-semibold mt-3">Page not found</h1>
        <p className="text-muted-foreground mt-3 max-w-md">
          The page you&apos;re looking for does not exist in this portfolio build.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 mt-6 px-5 py-3 rounded-full bg-primary text-primary-foreground font-medium"
        >
          Back home
        </Link>
      </div>
    </div>
  )
}

const ASCII_ART = `\n  █████╗ ███╗   ██╗██╗  ██╗██╗████████╗\n ██╔══██╗████╗  ██║██║ ██╔╝██║╚══██╔══╝\n ███████║██╔██╗ ██║█████╔╝ ██║   ██║   \n ██╔══██║██║╚██╗██║██╔═██╗ ██║   ██║   \n ██║  ██║██║ ╚████║██║  ██╗██║   ██║   \n ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝   ╚═╝   \n`

console.log(`%c${ASCII_ART}`, 'color: #20d6ee; font-size: 12px; font-family: monospace;')
console.log('%cAI systems, full-stack products, and geospatial engineering.', 'background: #20d6ee; color: #111827; font-size: 13px; font-weight: bold; padding: 4px 8px; border-radius: 999px;')

const root = document.getElementById('root')!
const app = (
  <StrictMode>
    <BrowserRouter>
      <ConditionalNav />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/ops" element={<OpsDashboard />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <GlobalChat />
      <Analytics />
    </BrowserRouter>
  </StrictMode>
)

if (root.hasChildNodes()) {
  hydrateRoot(root, app)
} else {
  createRoot(root).render(app)
}
