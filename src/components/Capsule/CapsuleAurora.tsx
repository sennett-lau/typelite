import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useAppStore } from '../../stores/appStore'
import { envelope, rmsToLevel } from '../../lib/waveform'

/** What the aurora shows: drifting glow, working sweep, the done flash or the calm fade's flash. */
export type AuroraMode = 'listening' | 'working' | 'done' | 'quiet'

/** Glow opacity in silence, and how much loud speech adds on top. */
const GLOW_BASE_OPACITY = 0.35
const GLOW_VOICE_BOOST = 0.3

interface CapsuleAuroraProps {
  mode: AuroraMode
  /**
   * Plan `quiet-no-speech`: this light is draining to grey during the calm fade (the parent fades
   * and greys it), so its motion stops where it is and it no longer follows the voice.
   */
  draining?: boolean
}

/**
 * The aurora light inside the dark glass pill (plan `aurora-pill`). Colours come from
 * `--color-aurora-a` (teal in dark mode, blue in light mode) and `--color-aurora-b` (violet).
 *
 * - `listening`: two blurred blobs drift slowly (CSS animation). One requestAnimationFrame
 *   loop lifts their opacity with the voice level, so the glow breathes with speech.
 * - `working`: a soft band of the same gradient sweeps left to right every 1.4 s.
 * - `done`: one short flash of the first colour.
 * - `quiet`: plan `quiet-no-speech`, one brief soft grey flash for a run that heard no speech,
 *   while the light that was showing drains to grey (`draining`).
 *
 * Only `transform`, `opacity` and `filter` are animated. With reduced motion the gradients stay
 * still (see `.aurora-*` in globals.css), the level loop does not run and the calm fade has no
 * flash.
 */
export function CapsuleAurora({ mode, draining = false }: CapsuleAuroraProps) {
  const glowRef = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    const glow = glowRef.current
    if (mode !== 'listening' || reduced || draining || !glow) return

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
  }, [mode, reduced, draining])

  return (
    <div
      className={draining ? 'aurora aurora-draining' : 'aurora'}
      aria-hidden="true"
      data-testid="capsule-aurora"
      data-mode={mode}
      data-draining={draining ? 'true' : undefined}
    >
      {mode === 'listening' && (
        <div ref={glowRef} className="aurora-glow" style={{ opacity: GLOW_BASE_OPACITY }}>
          <div className="aurora-blob aurora-blob-a" />
          <div className="aurora-blob aurora-blob-b" />
        </div>
      )}
      {mode === 'working' && <div className="aurora-sweep" />}
      {mode === 'done' && <div className="aurora-flash" />}
      {mode === 'quiet' && <div className="aurora-quiet" />}
    </div>
  )
}
