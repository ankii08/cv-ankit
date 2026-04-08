import { useCallback, useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

const navItems = [
  { label: 'AD', href: '#home' },
  { label: 'Home', href: '#home' },
  { label: 'About', href: '#about' },
  { label: 'Skills', href: '#skills' },
  { label: 'Experience', href: '#experience' },
  { label: 'Projects', href: '#projects' },
  { label: 'Contact', href: '#contact' },
]

function useTheme() {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  useEffect(() => {
    if (localStorage.getItem('theme')) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (event: MediaQueryListEvent) => {
      setIsDark(event.matches)
      document.documentElement.classList.toggle('dark', event.matches)
      document.documentElement.classList.toggle('light', !event.matches)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const toggleTheme = useCallback(() => {
    document.documentElement.style.setProperty('--theme-transition', 'none')
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    document.documentElement.classList.toggle('light', !next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.style.removeProperty('--theme-transition')
      })
    })
  }, [isDark])

  return { isDark, toggleTheme }
}

export default function GlobalNav() {
  const { isDark, toggleTheme } = useTheme()

  return (
    <nav className="fixed top-0 inset-x-0 z-50">
      <div className="absolute inset-0 bg-background/75 backdrop-blur-md border-b border-border" />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <a href="#home" className="font-display text-lg font-bold tracking-tight shrink-0">
            AD
          </a>
          <div className="hidden md:flex items-center gap-4 text-sm text-muted-foreground min-w-0">
            {navItems.slice(1).map((item) => (
              <a key={item.href} href={item.href} className="hover:text-foreground transition-colors whitespace-nowrap">
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="md:hidden flex items-center gap-2 overflow-x-auto max-w-[68vw] no-scrollbar text-sm text-muted-foreground">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="hover:text-foreground transition-colors whitespace-nowrap px-1">
                {item.label}
              </a>
            ))}
          </div>
          <button
            onClick={toggleTheme}
            className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center hover:border-primary/50 transition-colors shrink-0"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="w-5 h-5 text-primary" /> : <Moon className="w-5 h-5 text-primary" />}
          </button>
        </div>
      </div>
    </nav>
  )
}
