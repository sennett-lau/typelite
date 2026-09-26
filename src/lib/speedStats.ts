/**
 * Plan `typing-speed-and-nudge`: speaking and typing speed as the backend reports them. A value is
 * null until there is enough data (10 s of speech, 1 minute of active typing).
 */
export interface SpeedSummary {
  speakingWpm: number | null
  typingWpm: number | null
  timesFaster: number | null
}

/** Sent by the backend after the totals changed, with a {@link SpeedSummary}. */
export const SPEED_STATS_EVENT = 'speed:stats'
/** Sent by the backend to show the typing nudge in the pill. */
export const TYPING_NUDGE_EVENT = 'typing:nudge'

export const EMPTY_SPEED: SpeedSummary = { speakingWpm: null, typingWpm: null, timesFaster: null }

/** A WPM value for display: a whole number, or null when missing. */
export function formatWpm(value: number | null): string | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null
  return String(Math.round(value))
}

/** The "N× faster" factor with one decimal, or null when either side is missing. */
export function formatTimesFaster(summary: SpeedSummary): string | null {
  const { timesFaster } = summary
  if (formatWpm(summary.speakingWpm) === null || formatWpm(summary.typingWpm) === null) return null
  if (timesFaster === null || !Number.isFinite(timesFaster) || timesFaster <= 0) return null
  return timesFaster.toFixed(1)
}
