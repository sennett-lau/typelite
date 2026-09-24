import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import type { Theme } from '../stores/appStore'

/**
 * Tells macOS which appearance this window uses. The main window's native blur
 * (NSVisualEffectView) follows the window appearance, not our CSS, so without this a
 * "Dark" choice on a light Mac would put the dark tint over a light blur. `null` = follow
 * the system. Outside Tauri (tests, browser preview) this quietly does nothing.
 */
function applyWindowTheme(theme: Theme) {
  import('@tauri-apps/api/window')
    .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(theme === 'system' ? null : theme))
    .catch(() => {})
}

export function useTheme() {
  const theme = useAppStore((s) => s.config.theme)

  useEffect(() => {
    const root = document.documentElement

    function applyTheme(t: Theme) {
      if (t === 'dark') {
        root.classList.add('dark')
      } else if (t === 'light') {
        root.classList.remove('dark')
      } else {
        // system
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        root.classList.toggle('dark', prefersDark)
      }
    }

    applyTheme(theme)
    applyWindowTheme(theme)

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (e: MediaQueryListEvent) => {
        root.classList.toggle('dark', e.matches)
      }
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  return theme
}
