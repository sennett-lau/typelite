// Pure helpers for the capsule waveform (see docs/plans/0002-v1-scope/capsule-waveform.md).
// Kept free of React and the DOM so they can be unit-tested.

/** Number of bars, and so the number of history samples shown. */
export const WAVEFORM_BARS = 18
/** A new history sample is pushed every this many milliseconds (about 30 per second). */
export const WAVEFORM_SAMPLE_MS = 33
/** Envelope time constant while the level goes up (fast attack). */
export const RISE_TAU_MS = 40
/** Envelope time constant while the level goes down (slower release). */
export const FALL_TAU_MS = 150

const FLOOR_DB = -50
const CEIL_DB = -10

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0
  return Math.min(1, Math.max(0, x))
}

/**
 * Maps a raw RMS amplitude (0..1, as emitted by the Rust `audio:volume` event) to a
 * display level 0..1 on a log (decibel) scale: -50 dB and below is 0, -10 dB and above is 1.
 * Normal speech sits around -30..-15 dB, so it fills most of the height.
 */
export function rmsToLevel(rms: number): number {
  const safe = Number.isFinite(rms) ? Math.max(rms, 1e-5) : 1e-5
  const db = 20 * Math.log10(safe)
  return clamp01((db - FLOOR_DB) / (CEIL_DB - FLOOR_DB))
}

/**
 * One step of a first-order smoothing filter with a fast rise and a slower fall.
 * `alpha = 1 - exp(-dt / tau)` makes the result independent of the frame rate.
 */
export function envelope(prev: number, target: number, dtMs: number): number {
  if (dtMs <= 0) return prev
  const tau = target > prev ? RISE_TAU_MS : FALL_TAU_MS
  const alpha = 1 - Math.exp(-dtMs / tau)
  return prev + (target - prev) * alpha
}

/**
 * Fixed-size ring buffer of recent levels. Index 0 is the oldest sample (left bar),
 * index `size - 1` the newest (right bar).
 */
export class LevelHistory {
  readonly size: number
  private readonly buf: Float32Array
  private head = 0 // position of the oldest sample

  constructor(size: number = WAVEFORM_BARS) {
    this.size = size
    this.buf = new Float32Array(size)
  }

  /** Adds the newest sample and drops the oldest. */
  push(level: number): void {
    this.buf[this.head] = clamp01(level)
    this.head = (this.head + 1) % this.size
  }

  /** Sample `i` (0 = oldest, size-1 = newest), clamped to the valid range. */
  at(i: number): number {
    const k = Math.min(this.size - 1, Math.max(0, Math.floor(i)))
    return this.buf[(this.head + k) % this.size]
  }

  /**
   * Value for bar `i` while the history scrolls left between two pushes.
   * `frac` (0..1) is how far we are towards the next push: at 0 the bar shows sample i,
   * at 1 it shows sample i+1. The newest bar blends towards `live` (the current,
   * not yet pushed level), which defaults to the newest sample.
   */
  sample(i: number, frac: number, live?: number): number {
    const f = clamp01(frac)
    const a = this.at(i)
    const b = i + 1 < this.size ? this.at(i + 1) : clamp01(live ?? a)
    return a + (b - a) * f
  }

  clear(): void {
    this.buf.fill(0)
    this.head = 0
  }
}

/**
 * Colour of bar `index`: the aurora gradient from `--color-aurora-a` on the left to
 * `--color-aurora-b` on the right (teal to violet in dark mode, blue to violet in light mode).
 */
export function waveformBarColor(index: number, count: number = WAVEFORM_BARS): string {
  const towardsB = count > 1 ? Math.round(clamp01(index / (count - 1)) * 100) : 0
  // Mostly white so the bars stand out against the aurora glow behind them; the tint only
  // hints at the teal-to-violet gradient.
  const tint = `color-mix(in srgb, var(--color-aurora-b) ${towardsB}%, var(--color-aurora-a))`
  return `color-mix(in srgb, ${tint} 25%, #ffffff)`
}
