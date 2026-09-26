import { useCallback, useEffect, useState } from 'react'
import { resumeHotkey } from '../../lib/tauri'

/**
 * Shortcuts are registered at app start even during onboarding, but the shortcut gate (plan
 * `onboarding-shortcut-gate`) lets only an exercise page's role run. Each shortcut page registers
 * them again when it opens, so a shortcut paused by an earlier recording or a late Accessibility
 * grant works now. Returns the error, if any, and a retry.
 */
export function useLiveShortcuts(): { error: string | null; retry: () => void } {
  const [error, setError] = useState<string | null>(null)
  const retry = useCallback(() => {
    setError(null)
    resumeHotkey().catch((resumeError) => setError(String(resumeError)))
  }, [])
  useEffect(() => {
    retry()
  }, [retry])
  return { error, retry }
}
