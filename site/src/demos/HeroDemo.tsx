import type { CSSProperties } from 'react'
import { easeOut, progress } from '../lib/clock'
import { IconArrowRight, IconMic, IconSparkle } from '../components/Icons'
import {
  Aurora,
  Pill,
  PillDone,
  PillRecording,
  PillWorking,
  RECORDING_WIDTH,
  WORKING_WIDTH,
  speechBetween,
} from '../components/Pill'
import { Stage } from '../components/Stage'

/**
 * The hero demo: a chat app on a desktop. Press fn, speak (the raw words appear in the
 * caption), press fn again, and the pill transcribes, polishes and pastes clean text into the
 * message field. Three messages, then it loops.
 */

interface Word {
  w: string
  /** Dropped by AI polish: a filler, a repeat, or a self-corrected part. */
  cut?: boolean
}

interface Example {
  words: Word[]
  clean: string
  reply?: string
}

const W = (s: string): Word[] =>
  s.split(' ').map((w) => (w.startsWith('~') ? { w: w.slice(1), cut: true } : { w }))

const EXAMPLES: Example[] = [
  {
    words: W("~um yes let's meet at ~3 ~no ~actually 4"),
    clean: "Yes! Let's meet at 4.",
    reply: 'Perfect. Can you bring the deck?',
  },
  {
    words: W("sure I'll bring the ~the deck and ~uh the budget sheet too"),
    clean: "Sure, I'll bring the deck and the budget sheet too.",
    reply: '好呀，聽日見！',
  },
  {
    words: W('~嗯 我會 帶埋 ~帶埋 個 laptop 過嚟'),
    clean: '我會帶埋個laptop過嚟。',
  },
]

/** Seconds per message, and the pause after the last one. */
const E = 8
const HOLD = 1.5
export const HERO_DURATION = EXAMPLES.length * E + HOLD
export const HERO_REST = 6.0

// Moments inside one message.
const PRESS_1 = 0
const PILL_IN = 0.3
const SPEAK_START = 0.55
const SPEAK_END = 3.5
const PRESS_2 = 3.8
const POLISH = 4.5
const DONE = 5.3
const PILL_OUT = 5.8
const SEND = 6.6
const REPLY = 7.3

function entrance(t: number, at: number): CSSProperties | undefined {
  const p = easeOut(progress(t, at, at + 0.35))
  if (p >= 1) return undefined
  return { opacity: p, transform: `translateY(${(1 - p) * 8}px) scale(${0.97 + 0.03 * p})` }
}

export function HeroDemo() {
  return (
    <Stage
      duration={HERO_DURATION}
      restAt={HERO_REST}
      className="hero-stage hero-frame"
      controlsLeft
      label="Animated demo: dictating three chat messages. Filler words and self-corrections are removed before the text is pasted."
    >
      {({ t }) => <HeroFrame t={t} />}
    </Stage>
  )
}

export function HeroFrame({ t }: { t: number }) {
  const index = Math.min(EXAMPLES.length - 1, Math.floor(t / E))
  const u = t - index * E
  const ex = EXAMPLES[index]

  // Bubbles so far.
  const bubbles: { key: string; text: string; out: boolean; style?: CSSProperties }[] = [
    { key: 'hi', text: 'Back at my desk now.', out: true },
    { key: 'start', text: 'Great! Are we still on for today?', out: false },
  ]
  EXAMPLES.forEach((e, i) => {
    const local = t - i * E
    if (local >= SEND)
      bubbles.push({ key: `o${i}`, text: e.clean, out: true, style: entrance(local, SEND) })
    if (e.reply && local >= REPLY)
      bubbles.push({ key: `r${i}`, text: e.reply, out: false, style: entrance(local, REPLY) })
  })

  const typed = u >= DONE && u < SEND ? ex.clean : ''
  const flash = u >= DONE && u < DONE + 0.8
  const keyDown = (u >= PRESS_1 && u < PRESS_1 + 0.25) || (u >= PRESS_2 && u < PRESS_2 + 0.25)

  // Pill state.
  let pill = null
  let width = RECORDING_WIDTH
  const visible = u >= PILL_IN && u < PILL_OUT
  const speaking = speechBetween(SPEAK_START, SPEAK_END)
  if (u < PRESS_2) {
    pill = (
      <>
        <Aurora mode="listening" t={t} level={speaking(u) * 0.8} />
        <PillRecording t={u} speaking={speaking} seed={index + 1} />
      </>
    )
  } else if (u < DONE) {
    width = WORKING_WIDTH
    pill = (
      <>
        <Aurora mode="working" t={u} since={PRESS_2} />
        <PillWorking
          key={u < POLISH ? 'tr' : 'po'}
          label={u < POLISH ? 'Transcribing' : 'Polishing'}
        />
      </>
    )
  } else {
    width = WORKING_WIDTH
    pill = (
      <>
        <Aurora mode="done" t={u} since={DONE} />
        <PillDone />
      </>
    )
  }

  // Caption: words appear as they are spoken; cut words are struck through once polished.
  const n = ex.words.length
  const wordAt = (i: number) => SPEAK_START + 0.05 + ((SPEAK_END - SPEAK_START - 0.2) * i) / n
  const showCuts = u >= POLISH
  const inHold = t >= EXAMPLES.length * E

  return (
    <>
      <div className="screen screen-hero">
        <div className="key-hint" aria-hidden="true">
          <span>Dictate</span>
          <kbd className={`kbd kbd-lg ${keyDown ? 'is-down' : ''}`}>fn</kbd>
        </div>
        <div className="win chat" aria-hidden="true">
          <div className="win-bar">
            <span className="lights">
              <i />
              <i />
              <i />
            </span>
            <span className="chat-avatar">S</span>
            <span>Sam</span>
            <span className="chat-sub">Messages</span>
          </div>
          <div className="chat-body">
            {bubbles.slice(-5).map((b) => (
              <div
                key={b.key}
                className={`bubble ${b.out ? 'bubble-out' : 'bubble-in'}`}
                style={b.style}
              >
                {b.text}
              </div>
            ))}
          </div>
          <div className="chat-input">
            {typed ? (
              <span className={`typed ${flash ? 'flash' : ''}`}>{typed}</span>
            ) : (
              <span className="ph">Message</span>
            )}
            <span className="caret" style={{ opacity: Math.floor(t * 1.8) % 2 === 0 ? 1 : 0 }} />
            <span className={`chat-send ${typed ? 'on' : ''}`}>
              <IconArrowRight size={14} style={{ transform: 'rotate(-90deg)' }} />
            </span>
          </div>
        </div>
        <div className="pill-dock" aria-hidden="true">
          <Pill width={width} visible={visible && !inHold}>
            {pill}
          </Pill>
        </div>
      </div>
      <div className="captions">
        <div className="card caption">
          <span className="caption-label">
            <IconMic size={14} /> You say
          </span>
          <p className="caption-text" lang={index === 2 ? 'yue' : 'en'}>
            {inHold || u < SPEAK_START
              ? ' '
              : ex.words.map((word, i) => (
                  <span key={i}>
                    <span
                      className={`word ${u < wordAt(i) ? 'pending' : ''} ${showCuts && word.cut ? 'cut' : ''}`}
                    >
                      {word.w}
                    </span>{' '}
                  </span>
                ))}
          </p>
        </div>
        <div className="card caption">
          <span className="caption-label">
            <IconSparkle size={14} /> Typelite types
          </span>
          <p className="caption-text caption-clean" lang={index === 2 ? 'yue' : 'en'}>
            {!inHold && u >= DONE ? ex.clean : ' '}
          </p>
        </div>
      </div>
    </>
  )
}
