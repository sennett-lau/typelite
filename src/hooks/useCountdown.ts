import { useCallback, useEffect, useRef } from 'react'

/**
 * A countdown that can pause (plan 0018: the Copy pill's 8 s, paused while hovered).
 *
 * While `running`, `onExpire` fires once the remaining time is used up. Pausing keeps the
 * remaining time; running again continues from there. A new `resetKey` starts over from
 * `durationMs`. `progress()` returns the share of time left (1 → 0) for drawing, without
 * re-rendering the component.
 */
export function useCountdown(
  durationMs: number,
  running: boolean,
  onExpire: () => void,
  resetKey?: unknown,
): { progress: () => number } {
  const remaining = useRef(durationMs)
  const startedAt = useRef<number | null>(null)
  const lastKey = useRef(resetKey)
  const expire = useRef(onExpire)

  useEffect(() => {
    expire.current = onExpire
  })

  useEffect(() => {
    if (lastKey.current !== resetKey) {
      lastKey.current = resetKey
      remaining.current = durationMs
    }
    if (!running || remaining.current <= 0) return
    startedAt.current = Date.now()
    const timer = setTimeout(() => {
      remaining.current = 0
      startedAt.current = null
      expire.current()
    }, remaining.current)
    return () => {
      clearTimeout(timer)
      if (startedAt.current !== null) {
        remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current))
        startedAt.current = null
      }
    }
  }, [running, resetKey, durationMs])

  const progress = useCallback(() => {
    const left =
      startedAt.current === null
        ? remaining.current
        : remaining.current - (Date.now() - startedAt.current)
    return Math.min(1, Math.max(0, left / durationMs))
  }, [durationMs])

  return { progress }
}
