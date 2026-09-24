import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import {
  checkAccessibilityPermission,
  getAutomationPermission,
  getMicrophonePermission,
  requestAccessibilityPermission,
  requestAutomationPermission,
  requestMicrophonePermission,
  resumeHotkey,
} from '../../lib/tauri'
import type { PermissionStatus, PrivacyPane } from '../../lib/tauri'

export type PermissionId = PrivacyPane
export const PERMISSION_IDS: PermissionId[] = ['microphone', 'accessibility', 'automation']

/** `null` while the first check is still running. */
export type PermissionStatuses = Record<PermissionId, PermissionStatus | null>

export interface PermissionsState {
  statuses: PermissionStatuses
  /** Last error per row (a failed check or grant), shown with a retry. */
  errors: Record<PermissionId, string | null>
  /** Rows whose Grant is running (a macOS prompt may be open). */
  busy: Record<PermissionId, boolean>
  allGranted: boolean
  grant: (id: PermissionId) => Promise<void>
  refresh: () => Promise<void>
}

/** How often the rows re-check while the welcome step is visible. */
export const PERMISSION_POLL_MS = 1500

const emptyStatuses: PermissionStatuses = {
  microphone: null,
  accessibility: null,
  automation: null,
}
const emptyErrors: Record<PermissionId, string | null> = {
  microphone: null,
  accessibility: null,
  automation: null,
}
const idle: Record<PermissionId, boolean> = {
  microphone: false,
  accessibility: false,
  automation: false,
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function readStatus(id: PermissionId): Promise<PermissionStatus> {
  if (id === 'microphone') return getMicrophonePermission()
  if (id === 'automation') return getAutomationPermission()
  // Accessibility has no "not determined": macOS only says trusted or not.
  return (await checkAccessibilityPermission()) ? 'granted' : 'not_determined'
}

/**
 * Live status of the three macOS permissions onboarding needs.
 *
 * macOS sends no event when the user flips a switch in System Settings, so while `active`
 * (the welcome step is on screen and the window is visible) we check again every
 * `PERMISSION_POLL_MS`. The checks never show a prompt; only `grant` does.
 */
export function usePermissions(active: boolean): PermissionsState {
  const setAccessibilityTrusted = useAppStore((s) => s.setAccessibilityTrusted)
  const [statuses, setStatuses] = useState<PermissionStatuses>(emptyStatuses)
  const [errors, setErrors] = useState(emptyErrors)
  const [busy, setBusy] = useState(idle)
  const accessibilityWasGranted = useRef<boolean | null>(null)

  const refresh = useCallback(async () => {
    const results = await Promise.all(
      PERMISSION_IDS.map((id) =>
        readStatus(id).then(
          (status) => ({ id, status, error: null as string | null }),
          (error) => ({ id, status: null, error: errorText(error) }),
        ),
      ),
    )
    setStatuses((previous) => {
      const next = { ...previous }
      for (const result of results) {
        if (result.status) next[result.id] = result.status
      }
      return next
    })
    setErrors((previous) => {
      const next = { ...previous }
      for (const result of results) {
        // A failed check shows its error; once a row is granted, any old error goes away.
        if (result.error) next[result.id] = result.error
        else if (result.status === 'granted') next[result.id] = null
      }
      return next
    })
  }, [])

  // The event tap behind the global shortcuts fails while Accessibility is missing, so
  // register the shortcuts again the moment it flips to granted (no restart needed).
  useEffect(() => {
    const granted = statuses.accessibility === 'granted'
    if (statuses.accessibility === null) return
    const before = accessibilityWasGranted.current
    accessibilityWasGranted.current = granted
    setAccessibilityTrusted(granted)
    if (granted && before === false) {
      resumeHotkey().catch((error) => {
        console.error('Failed to re-register shortcuts after Accessibility grant:', error)
      })
    }
  }, [setAccessibilityTrusted, statuses.accessibility])

  useEffect(() => {
    if (!active) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        await refresh().catch(() => {})
      }
      if (!stopped) timer = setTimeout(tick, PERMISSION_POLL_MS)
    }
    void tick()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [active, refresh])

  const grant = useCallback(
    async (id: PermissionId) => {
      setBusy((previous) => ({ ...previous, [id]: true }))
      setErrors((previous) => ({ ...previous, [id]: null }))
      try {
        if (id === 'microphone') {
          const status = await requestMicrophonePermission()
          setStatuses((previous) => ({ ...previous, microphone: status }))
        } else if (id === 'automation') {
          const status = await requestAutomationPermission()
          setStatuses((previous) => ({ ...previous, automation: status }))
        } else {
          // Shows the macOS dialog that points to System Settings → Accessibility. The user
          // turns the switch on there; the poll above picks it up.
          await requestAccessibilityPermission()
          await refresh()
        }
      } catch (error) {
        setErrors((previous) => ({ ...previous, [id]: errorText(error) }))
      } finally {
        setBusy((previous) => ({ ...previous, [id]: false }))
      }
    },
    [refresh],
  )

  const allGranted = PERMISSION_IDS.every((id) => statuses[id] === 'granted')

  return { statuses, errors, busy, allGranted, grant, refresh }
}
