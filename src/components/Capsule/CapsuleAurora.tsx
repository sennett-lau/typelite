import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useAppStore } from '../../stores/appStore'
import { envelope, rmsToLevel } from '../../lib/waveform'

/** What the aurora shows: drifting glow, working sweep, or the done flash. */
export type AuroraMode = 'listening' | 'working' | 'done'

/** Glow opacity in silence, and how much loud speech adds on top. */
const GLOW_BASE_OPACITY = 0.35
const GLOW_VOICE_BOOST = 0.3

/**
 * The aurora light inside the dark glass pill (plan 0009). Colours come from
 * `--color-aurora-a` (teal in dark mode, blue in light mode) and `--color-aurora-b` (violet).
 *
 * - `listening`: two blurred blobs drift slowly (CSS animation). One requestAnimationFrame
 *   loop lifts their opacity with the voice level, so the glow breathes with speech.
 * - `working`: a soft band of the same gradient sweeps left to right every 1.4 s.
 * - `done`: one short flash of the first colour.
 *
 * Only `transform`, `opacity` and `filter: blur` are animated. With reduced motion the
 * gradients stay still (see `.aurora-*` in globals.css) and the level loop does not run.
 */
export function CapsuleAurora({ mode }: { mode: AuroraMode }) {
  const glowRef = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    const glow = glowRef.current
    if (mode !== 'listening' || reduced || !glow) return

    let level = 0
    let last: number | null = null
    let raf = 0
    const frame = (now: number) => {
      const dt = last === null ? 0 : Math.max(0, now - last)
      last = now
      level = envelope(level, rmsToLevel(useAppStore.getState().audioVolume), dt)
      glow.style.opacity = (GLOW_BASE_OPACITY + GLOW_VOICE_BOOST * level).toFixed(3)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [mode, reduced])

  return (
    <div className="aurora" aria-hidden="true" data-testid="capsule-aurora" data-mode={mode}>
      {mode === 'listening' && (
        <div ref={glowRef} className="aurora-glow" style={{ opacity: GLOW_BASE_OPACITY }}>
          <div className="aurora-blob aurora-blob-a" />
          <div className="aurora-blob aurora-blob-b" />
        </div>
      )}
      {mode === 'working' && <div className="aurora-sweep" />}
      {mode === 'done' && <div className="aurora-flash" />}
    </div>
  )
}
