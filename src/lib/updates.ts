import { useCallback, useEffect, useRef, useState } from 'react'
import { UPDATE_STATUS_EVENT, updateStatus, type UpdateStatus } from './tauri'

/**
 * Plan `auto-update`: the update status, loaded once and then kept current from the
 * `update:status` event. Shared by Home's update bar and Settings → System → Updates.
 */
export function useUpdateStatus(): [UpdateStatus, (status: UpdateStatus) => void] {
  const [status, setStatusState] = useState<UpdateStatus>({ state: 'idle' })
  // Set once a button or an event gave a status, so the first load cannot overwrite it.
  const newer = useRef(false)
  const setStatus = useCallback((next: UpdateStatus) => {
    newer.current = true
    setStatusState(next)
  }, [])
  useEffect(() => {
    let live = true
    let unlisten: (() => void) | undefined
    const load = () =>
      Promise.resolve()
        .then(() => updateStatus())
        .then((next) => {
          if (live && next && !newer.current) setStatusState(next)
        })
        .catch(() => {})
    // Listen first, then load: a status sent between the load and the listener would be lost
    // (the check that runs 20 s after start, say).
    import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<UpdateStatus>(UPDATE_STATUS_EVENT, (event) => {
          if (live && event.payload) setStatus(event.payload)
        }),
      )
      .then((stop) => {
        if (live) unlisten = stop
        else stop()
      })
      .catch(() => {})
      .then(load)
    return () => {
      live = false
      unlisten?.()
    }
  }, [setStatus])
  return [status, setStatus]
}

/** Download progress as a whole percentage, or null while the size is unknown. */
export function downloadPercent(status: UpdateStatus): number | null {
  if (status.state !== 'downloading' || !status.total) return null
  return Math.min(100, Math.round((status.downloaded / status.total) * 100))
}
