import { useEffect, useState, type RefObject } from 'react'
import { REPO } from '../links'

/* ─── Theme ─── */

export type Theme = 'light' | 'dark'
const THEME_KEY = 'typelite-theme'

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

/**
 * The page follows the system setting until the visitor picks a theme with the toggle. The
 * choice is set on <html data-theme> (also by the inline script in index.html, before the
 * first paint) and remembered in this browser only.
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const current = () => readStored() ?? (mq.matches ? 'dark' : 'light')
    setTheme(current())
    const onChange = () => {
      if (!readStored()) setTheme(current())
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      // Private mode or blocked storage: the choice lasts for this page view.
    }
    setTheme(next)
  }

  return [theme, toggle]
}

/* ─── GitHub stars ─── */

export interface RepoStats {
  stars: number
  forks: number
}

const STATS_KEY = 'typelite-repo-stats'
const STATS_TTL_MS = 30 * 60 * 1000

/**
 * Star and fork counts from GitHub's public API, fetched after the page has rendered. While
 * the repository is private (or the API is rate-limited or offline) this stays null and the
 * buttons simply show no number. Cached for 30 minutes in session storage.
 */
export function useRepoStats(): RepoStats | null {
  const [stats, setStats] = useState<RepoStats | null>(null)

  useEffect(() => {
    try {
      const cached = JSON.parse(sessionStorage.getItem(STATS_KEY) ?? 'null')
      if (cached && Date.now() - cached.at < STATS_TTL_MS) {
        setStats(cached.stats)
        return
      }
    } catch {
      // Ignore unreadable storage.
    }
    const controller = new AbortController()
    fetch(`https://api.github.com/repos/${REPO}`, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || typeof data.stargazers_count !== 'number') return
        const next = { stars: data.stargazers_count, forks: data.forks_count ?? 0 }
        setStats(next)
        try {
          sessionStorage.setItem(STATS_KEY, JSON.stringify({ at: Date.now(), stats: next }))
        } catch {
          // Ignore.
        }
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  return stats
}

export function formatCount(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

/* ─── Scroll reveal ─── */

/**
 * Fades sections up as they scroll into view. Only elements that start below the viewport
 * are armed, so nothing already on screen blinks, and without JavaScript (or with reduced
 * motion) everything is simply visible.
 */
export function useScrollReveal() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (typeof IntersectionObserver === 'undefined') return
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in')
            io.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    for (const el of els) {
      if (el.getBoundingClientRect().top > window.innerHeight) {
        el.classList.add('reveal-armed')
        io.observe(el)
      }
    }
    return () => io.disconnect()
  }, [])
}

/** Scroll state for the top bar's glass background. */
export function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])
  return scrolled
}

/**
 * Reading progress for the top bar: writes `scaleX(progress)` straight onto the element (no
 * React render per scroll event), at most once per animation frame.
 */
export function useScrollProgress(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const update = () => {
      raf = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      el.style.transform = `scaleX(${p.toFixed(4)})`
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [ref])
}

/** The id of the section in the middle of the viewport, among `ids` (null above them). */
export function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null)
  const key = ids.join(',')
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const els = key
      .split(',')
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
    const visible = new Set<string>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id)
          else visible.delete(e.target.id)
        }
        // The last listed section that crosses the middle band wins.
        const ids = key.split(',')
        setActive(ids.filter((id) => visible.has(id)).pop() ?? null)
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [key])
  return active
}
