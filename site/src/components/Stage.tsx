import { useRef, type ReactNode } from 'react'
import { isCapture, useLoopClock, type Clock } from '../lib/clock'
import { IconPause, IconPlay } from './Icons'

/**
 * A looping animated demo. It plays only while on screen, can be paused (WCAG 2.2.2), and with
 * reduced motion shows one still frame (`restAt`). The same frame is in the pre-rendered HTML.
 */
export function Stage({
  duration,
  restAt,
  className = '',
  label,
  children,
  controls = true,
  controlsLeft = false,
}: {
  duration: number
  restAt: number
  className?: string
  /** Describes the animation for screen readers. */
  label: string
  children: (clock: Clock) => ReactNode
  controls?: boolean
  /** Put the pause button in the top left corner instead of the top right. */
  controlsLeft?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const clock = useLoopClock(ref, duration, restAt)
  return (
    <div ref={ref} className={className} role="group" aria-label={label}>
      {controls && !clock.reduced && !isCapture() && (
        <div className={`demo-controls ${controlsLeft ? 'demo-controls-left' : ''}`}>
          <button
            type="button"
            className="play-toggle"
            onClick={() => clock.setPaused(!clock.paused)}
            aria-label={clock.paused ? 'Play animation' : 'Pause animation'}
            title={clock.paused ? 'Play' : 'Pause'}
          >
            {clock.paused ? <IconPlay size={14} /> : <IconPause size={12} />}
          </button>
        </div>
      )}
      {children(clock)}
    </div>
  )
}
