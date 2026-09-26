import type { CSSProperties, ReactNode } from 'react'
import { easeInOut, voiceLevel } from '../lib/clock'
import { IconCheck, IconCopy, IconMessage, IconX } from './Icons'

/**
 * A faithful copy of Typelite's pill (the "capsule"): 32 pt dark glass with the aurora light
 * inside. Sizes, colours and timings come from the app (globals.css `.pill`, `.aurora-*`,
 * useCapsuleResize.ts); here everything is a function of the demo time `t`, not of live audio.
 */

export const PILL_HEIGHT = 32
export const RECORDING_WIDTH = 160
export const WORKING_WIDTH = 140
const WAVEFORM_BARS = 18
const SAMPLE_S = 0.033
const BAR_HEIGHT = 13
const MIN_SCALE = 3 / BAR_HEIGHT

export type AuroraMode = 'listening' | 'working' | 'done' | null

/** Ping-pong 0..1..0 over `period * 2` seconds, eased (CSS `alternate` + ease-in-out). */
function pingPong(t: number, period: number): number {
  const phase = (t / period) % 2
  const x = phase <= 1 ? phase : 2 - phase
  return easeInOut(x)
}

/** Piecewise keyframes 0% / 50% / 100%. */
function keyframes3(p: number, a: number, b: number, c: number): number {
  return p < 0.5 ? a + (b - a) * (p / 0.5) : b + (c - b) * ((p - 0.5) / 0.5)
}

export function Aurora({
  mode,
  t,
  level = 0,
  since = 0,
}: {
  mode: AuroraMode
  t: number
  /** Voice level 0..1 while listening. */
  level?: number
  /** When the current mode started (for the sweep phase and the flash). */
  since?: number
}) {
  if (!mode) return null
  if (mode === 'listening') {
    const pa = pingPong(t, 10)
    const pb = pingPong(t, 12)
    const a = `translateX(${keyframes3(pa, 0, 60, 120)}%) scale(${keyframes3(pa, 1, 1.15, 0.95)})`
    const b = `translateX(${keyframes3(pb, 0, -60, -120)}%) scale(${keyframes3(pb, 1, 0.9, 1.1)})`
    return (
      <div className="aurora" aria-hidden="true">
        <div className="aurora-glow" style={{ opacity: 0.35 + 0.3 * level }}>
          <div className="aurora-blob aurora-blob-a" style={{ transform: a }} />
          <div className="aurora-blob aurora-blob-b" style={{ transform: b }} />
        </div>
      </div>
    )
  }
  if (mode === 'working') {
    const p = easeInOut(((t - since) % 1.4) / 1.4)
    return (
      <div className="aurora" aria-hidden="true">
        <div
          className="aurora-sweep"
          style={{ transform: `translateX(${-100 + 245 * Math.max(0, p)}%)` }}
        />
      </div>
    )
  }
  const flash = Math.max(0, 0.8 * (1 - (t - since) / 0.5))
  return (
    <div className="aurora" aria-hidden="true">
      <div className="aurora-flash" style={{ opacity: flash }} />
    </div>
  )
}

/** The live waveform: 18 bars, newest on the right, scrolling left every 33 ms. */
export function Waveform({
  t,
  speaking,
  seed = 1,
}: {
  t: number
  /** 0..1 at a given time: how much speech there is (fades the level in and out). */
  speaking: (time: number) => number
  seed?: number
}) {
  const bars = []
  for (let i = 0; i < WAVEFORM_BARS; i++) {
    const time = t - (WAVEFORM_BARS - 1 - i) * SAMPLE_S
    const level = time < 0 ? 0 : voiceLevel(time, seed) * speaking(time)
    const scale = MIN_SCALE + (1 - MIN_SCALE) * level
    const towardsB = Math.round((i / (WAVEFORM_BARS - 1)) * 100)
    bars.push(
      <div
        key={i}
        className="pill-bar"
        style={{
          transform: `scaleY(${scale.toFixed(3)})`,
          opacity: (0.4 + 0.6 * level).toFixed(2),
          background: `color-mix(in srgb, color-mix(in srgb, var(--aurora-b) ${towardsB}%, var(--aurora-a)) 25%, #ffffff)`,
        }}
      />,
    )
  }
  return (
    <div className="pill-wave" aria-hidden="true">
      {bars}
    </div>
  )
}

export function Pill({
  width,
  visible = true,
  children,
  className = '',
  style,
  label,
}: {
  width: number
  visible?: boolean
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Accessible description of what the pill shows right now. */
  label?: string
}) {
  return (
    <div
      className={`pill ${visible ? '' : 'pill-gone'} ${className}`}
      style={{ width, height: PILL_HEIGHT, ...style }}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {children}
    </div>
  )
}

/** Recording: red dot, waveform, optional extra (Translate language), cancel ✕. */
export function PillRecording({
  t,
  speaking,
  seed,
  extra,
  icon,
}: {
  t: number
  speaking: (time: number) => number
  seed?: number
  extra?: ReactNode
  /** Replaces the red dot (Ask shows a speech bubble). */
  icon?: ReactNode
}) {
  const dot = 0.75 + 0.25 * Math.cos((t / 1.5) * Math.PI * 2)
  return (
    <div className="pill-content">
      {icon ?? <span className="pill-rec" style={{ opacity: dot }} />}
      <Waveform t={t} speaking={speaking} seed={seed} />
      {extra}
      <span className="pill-flex" />
      <span className="pill-x" aria-hidden="true">
        <IconX size={10} />
      </span>
    </div>
  )
}

export function PillAskIcon() {
  return <IconMessage size={12} className="pill-ask-icon" />
}

/** A working state: a short white label over the aurora sweep. */
export function PillWorking({ label, cancel = true }: { label: string; cancel?: boolean }) {
  return (
    <div className="pill-content">
      <p className="pill-label">{label}</p>
      {cancel && (
        <span className="pill-x" aria-hidden="true">
          <IconX size={10} />
        </span>
      )}
    </div>
  )
}

export function PillDone({ label = 'Done' }: { label?: string }) {
  return (
    <div className="pill-content pill-center">
      <IconCheck size={12} />
      <span className="pill-label-inline">{label}</span>
    </div>
  )
}

/** The Copy pill: language tag, the start of the result, and a Copy button with a countdown. */
export function PillCopy({
  text,
  lang,
  remaining,
  copied = false,
  onCopy,
}: {
  text: string
  lang?: string
  /** 1 → 0: what is left of the 8 s countdown drawn by the button's border. */
  remaining: number
  copied?: boolean
  onCopy?: () => void
}) {
  return (
    <div className="pill-content pill-copy-content">
      {lang && <span className="pill-lang">{lang}</span>}
      <p className="pill-copy-text">{text}</p>
      <button
        type="button"
        className={`pill-copy-button ${copied ? 'pill-copy-button-done' : ''}`}
        onClick={onCopy}
        tabIndex={onCopy ? 0 : -1}
        aria-label={copied ? 'Copied' : 'Copy the result'}
      >
        {!copied && (
          <svg className="pill-copy-ring" viewBox="0 0 62 22" aria-hidden="true">
            <rect
              className="pill-copy-ring-track"
              x="0.8"
              y="0.8"
              width="60.4"
              height="20.4"
              rx="10.2"
            />
            <rect
              x="0.8"
              y="0.8"
              width="60.4"
              height="20.4"
              rx="10.2"
              pathLength={100}
              strokeDasharray="100"
              strokeDashoffset={String(100 - remaining * 100)}
            />
          </svg>
        )}
        <span className="pill-copy-label">
          {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </span>
      </button>
    </div>
  )
}

/** A soft 0..1 speech envelope for words spoken between `start` and `end`. */
export function speechBetween(start: number, end: number) {
  return (time: number) => {
    if (time < start || time > end) return 0
    const fade = Math.min(1, (time - start) / 0.15, (end - time) / 0.2)
    return Math.max(0, fade)
  }
}
