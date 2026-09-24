import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useAppStore } from '../../stores/appStore'
import {
  LevelHistory,
  WAVEFORM_BARS,
  WAVEFORM_SAMPLE_MS,
  envelope,
  rmsToLevel,
} from '../../lib/waveform'

const BAR_HEIGHT_PX = 16
/** Smallest bar scale, so silence still shows a thin 3 px line. */
const MIN_SCALE = 3 / BAR_HEIGHT_PX
/** Scale used for every bar when the user prefers reduced motion. */
const REDUCED_SCALE = 0.5
/** After a long pause (for example a hidden window) do not replay more than one screen of history. */
const MAX_CATCH_UP_SAMPLES = WAVEFORM_BARS

function applyBar(bar: HTMLDivElement, level: number) {
  const scale = MIN_SCALE + (1 - MIN_SCALE) * level
  bar.style.transform = `scaleY(${scale.toFixed(3)})`
  bar.style.opacity = (0.4 + 0.6 * level).toFixed(2)
}

/**
 * Live voice waveform for the recording capsule.
 *
 * The level comes from the `audio:volume` event (raw RMS of the recorded audio, stored in
 * `audioVolume`). One requestAnimationFrame loop smooths it (fast rise, slower fall), pushes
 * a sample into a 24-slot history every 33 ms, and scrolls that history from right (newest)
 * to left (oldest). Bars are animated with `transform: scaleY()` only, so React never
 * re-renders per frame and the browser does no layout.
 */
export function Waveform() {
  const barsRef = useRef<(HTMLDivElement | null)[]>([])
  const reduced = useReducedMotion()

  useEffect(() => {
    const bars = barsRef.current

    if (reduced) {
      bars.forEach((bar) => {
        if (!bar) return
        bar.style.transform = `scaleY(${REDUCED_SCALE})`
        bar.style.opacity = '0.8'
      })
      return
    }

    const history = new LevelHistory(WAVEFORM_BARS)
    let level = 0
    let sinceSample = 0
    let last: number | null = null
    let raf = 0

    const frame = (now: number) => {
      const dt = last === null ? 0 : Math.max(0, now - last)
      last = now

      const target = rmsToLevel(useAppStore.getState().audioVolume)
      level = envelope(level, target, dt)

      // Time-based pushes keep the scroll speed constant whatever the frame rate.
      sinceSample += dt
      let pushes = 0
      while (sinceSample >= WAVEFORM_SAMPLE_MS) {
        sinceSample -= WAVEFORM_SAMPLE_MS
        if (pushes < MAX_CATCH_UP_SAMPLES) history.push(level)
        pushes++
      }

      // Scroll smoothly between pushes: each bar blends towards its right-hand neighbour.
      const frac = sinceSample / WAVEFORM_SAMPLE_MS
      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i]
        if (bar) applyBar(bar, history.sample(i, frac, level))
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  return (
    <div
      className="flex items-center gap-[2px] flex-shrink-0"
      style={{ height: BAR_HEIGHT_PX }}
      aria-hidden="true"
      data-testid="waveform"
    >
      {Array.from({ length: WAVEFORM_BARS }).map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            barsRef.current[i] = el
          }}
          className="w-[2px] rounded-full"
          style={{
            height: BAR_HEIGHT_PX,
            background: 'var(--color-wave)',
            transform: `scaleY(${MIN_SCALE})`,
            transformOrigin: 'center',
            willChange: 'transform',
            opacity: 0.4,
          }}
        />
      ))}
    </div>
  )
}
