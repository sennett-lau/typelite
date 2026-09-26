import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listen } from '@tauri-apps/api/event'
import { getSpeedStats } from '../../lib/tauri'
import {
  EMPTY_SPEED,
  formatTimesFaster,
  formatWpm,
  SPEED_STATS_EVENT,
  type SpeedSummary,
} from '../../lib/speedStats'

/** Loads the speed totals when Insights opens and follows each update from the backend. */
function useSpeedSummary(): SpeedSummary {
  const [summary, setSummary] = useState<SpeedSummary>(EMPTY_SPEED)

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null

    Promise.resolve()
      .then(() =>
        listen<SpeedSummary>(SPEED_STATS_EVENT, (event) => {
          if (!disposed && event.payload) setSummary(event.payload)
        }),
      )
      .then((fn) => {
        if (typeof fn !== 'function') return
        if (disposed) fn()
        else unlisten = fn
      })
      .catch(() => {
        // Not running inside Tauri (tests, plain browser): the row shows dashes.
      })

    Promise.resolve()
      .then(getSpeedStats)
      .then((value) => {
        if (!disposed && value) setSummary(value)
      })
      .catch(() => {
        // Same as above.
      })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  return summary
}

function Stat({ label, value, testId }: { label: string; value: string | null; testId: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-testid={testId}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
        {label}
      </span>
      <span className="text-[24px] font-bold leading-tight tracking-[-0.01em] text-text-primary tabular-nums">
        {value ?? '—'}
        {value !== null && (
          <small className="ml-[3px] text-[12px] font-semibold text-text-secondary">
            {t('home.speedCompare.wpm')}
          </small>
        )}
      </span>
    </div>
  )
}

/**
 * Plan `typing-speed-and-nudge`: the top row of Insights. "Speaking 142 WPM · Typing 48 WPM ·
 * 3.0× faster than typing". A side without enough data shows "—", and the badge then hides.
 */
export function SpeedCompare() {
  const { t } = useTranslation()
  const summary = useSpeedSummary()
  const speaking = formatWpm(summary.speakingWpm)
  const typing = formatWpm(summary.typingWpm)
  const faster = formatTimesFaster(summary)

  return (
    <div
      className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-7 gap-y-2 border-b border-hairline px-3.5 py-3"
      data-testid="speed-compare"
    >
      <Stat label={t('home.speedCompare.speaking')} value={speaking} testId="speed-speaking" />
      <Stat label={t('home.speedCompare.typing')} value={typing} testId="speed-typing" />
      {faster !== null && (
        <div
          className="justify-self-end rounded-[10px] bg-accent-light px-2.5 py-1.5 text-center text-[13px] font-bold leading-tight text-accent"
          data-testid="speed-faster"
        >
          {t('home.speedCompare.times', { value: faster })}
          <small className="block text-[10.5px] font-semibold opacity-80">
            {t('home.speedCompare.fasterThanTyping')}
          </small>
        </div>
      )}
    </div>
  )
}
