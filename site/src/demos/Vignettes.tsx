import { useState, type CSSProperties } from 'react'
import { easeInOut, easeOut, progress } from '../lib/clock'
import { IconArrowRight, IconX } from '../components/Icons'
import {
  Aurora,
  Pill,
  PillAskIcon,
  PillDone,
  PillRecording,
  PillWorking,
  RECORDING_WIDTH,
  WORKING_WIDTH,
  speechBetween,
} from '../components/Pill'
import { Stage } from '../components/Stage'
import { KeyCap } from '../components/KeyCap'
import { KeySync, type KeySignal } from '../lib/keySignal'

const fade = (t: number, at: number, len = 0.3): CSSProperties => {
  const p = easeOut(progress(t, at, at + len))
  return { opacity: p, transform: `translateY(${(1 - p) * 6}px)` }
}

/** A damped spring from 0 to 1 over `x` seconds (overshoots a little, then settles). */
function spring(x: number): number {
  if (x <= 0) return 0
  return 1 - Math.exp(-x * 9) * Math.cos(x * 14)
}

/* ─── Dictate: fillers out, corrections applied, punctuation in ─── */

const CLEANUPS: { raw: string; clean: string }[] = [
  {
    raw: 'so ~um I think we should ~uh ship it on friday',
    clean: 'I think we should ship it on Friday.',
  },
  { raw: 'send it ~to ~anna ~no ~wait to maria', clean: 'Send it to Maria.' },
  { raw: '~the the numbers look good right', clean: 'The numbers look good, right?' },
]
const CLEAN_EACH = 3.6

export function DictateVignette({ keys }: { keys?: KeySignal }) {
  return (
    <Stage
      duration={CLEANUPS.length * CLEAN_EACH}
      restAt={2.9}
      className="vignette plain"
      label="Animation: raw speech with filler words and a self-correction becomes a clean sentence."
    >
      {({ t }) => {
        const i = Math.floor(t / CLEAN_EACH) % CLEANUPS.length
        const u = t - i * CLEAN_EACH
        const ex = CLEANUPS[i]
        const cutOn = u > 1.0
        // Fn starts the recording and stops it again just before the cleanup.
        const down = u < 0.22 || (u >= 0.8 && u < 1.0)
        return (
          <div className="clean-demo">
            <KeySync signal={keys} down={down} />
            <div className="clean-line" style={fade(u, 0)}>
              <small>You say</small>
              {ex.raw.split(' ').map((w, k) => {
                const cut = w.startsWith('~')
                return (
                  <span key={k}>
                    <span className={`word ${cut && cutOn ? 'cut' : ''}`}>
                      {cut ? w.slice(1) : w}
                    </span>{' '}
                  </span>
                )
              })}
            </div>
            <div
              className="clean-arrow"
              aria-hidden="true"
              style={{ opacity: progress(u, 1.2, 1.5), color: 'var(--accent)' }}
            >
              <IconArrowRight size={18} style={{ transform: 'rotate(90deg)' }} />
            </div>
            <div className="clean-line" style={{ ...fade(u, 1.6), fontWeight: 600 }}>
              <small>Typelite types</small>
              {ex.clean}
            </div>
          </div>
        )
      }}
    </Stage>
  )
}

/* ─── Translate: switch language mid-recording ─── */

const LANGS = [
  { name: 'Français', short: 'FR', text: 'À demain matin à la gare.', width: 51, lang: 'fr' },
  { name: '日本語', short: '日', text: '明日の朝、駅で会いましょう。', width: 35, lang: 'ja' },
  {
    name: 'Español',
    short: 'ES',
    text: 'Nos vemos mañana por la mañana en la estación.',
    width: 48,
    lang: 'es',
  },
]
const TR_EACH = 9
const TR_SWITCH = 3.0
const TR_STOP = 5.4
const TR_POLISH = 6.1
const TR_DONE = 6.9

/** Width of the Translate recording pill (useCapsuleResize.ts `translateRecordingSize`). */
function translateWidth(nameWidth: number, dots: number) {
  const fixed = 14 + 8 + 8 + (18 * 4 - 2) + 8 + 20 + 12 + 8
  return Math.max(RECORDING_WIDTH, fixed + nameWidth + 8 + (dots * 5 + (dots - 1) * 4) + 8)
}

export function TranslateVignette({ keys }: { keys?: KeySignal }) {
  const [extra, setExtra] = useState(0)
  return (
    <Stage
      duration={TR_EACH * LANGS.length}
      restAt={TR_EACH + 4.2}
      className="vignette desk"
      label="Animation: a Translate recording. Pressing Shift, or clicking the language name on the pill, switches the target language while recording."
    >
      {({ t }) => {
        const loop = Math.floor(t / TR_EACH) % LANGS.length
        const u = t - loop * TR_EACH
        const switched = u >= TR_SWITCH ? 1 : 0
        const active = (loop + switched + extra) % LANGS.length
        const lang = LANGS[active]
        const shiftDown = u >= TR_SWITCH - 0.25 && u < TR_SWITCH
        const recording = u < TR_STOP
        const speaking = speechBetween(0.5, TR_STOP - 0.3)
        let width = translateWidth(lang.width, LANGS.length)
        let content
        if (recording) {
          content = (
            <>
              <Aurora mode="listening" t={t} level={speaking(u) * 0.8} />
              <PillRecording
                t={u}
                seed={3}
                speaking={speaking}
                extra={
                  <>
                    <button
                      key={lang.name}
                      type="button"
                      className="pill-lang-name pill-lang-switch pill-lang-swap"
                      style={{ width: lang.width }}
                      lang={lang.lang}
                      aria-label={`Translating into ${lang.name}. Click to switch language.`}
                      onClick={() => setExtra((x) => x + 1)}
                    >
                      {lang.name}
                    </button>
                    <span className="pill-lang-dots" aria-hidden="true">
                      {LANGS.map((l) => (
                        <i key={l.name} />
                      ))}
                      {/* The active dot slides to its place when the language changes. */}
                      <b style={{ transform: `translateX(${active * 9}px)` }} />
                    </span>
                  </>
                }
              />
            </>
          )
        } else if (u < TR_DONE) {
          width = WORKING_WIDTH
          content = (
            <>
              <Aurora mode="working" t={u} since={TR_STOP} />
              <PillWorking
                key={u < TR_POLISH ? 'a' : 'b'}
                label={u < TR_POLISH ? 'Transcribing' : 'Polishing'}
              />
            </>
          )
        } else {
          width = WORKING_WIDTH
          content = (
            <>
              <Aurora mode="done" t={u} since={TR_DONE} />
              <PillDone />
            </>
          )
        }
        const shortcutDown = u < 0.22 || (u >= TR_STOP - 0.22 && u < TR_STOP)
        return (
          <div className="translate-demo">
            <KeySync signal={keys} down={shortcutDown} />
            <div className="translate-out" aria-live="off">
              <small>{u >= TR_DONE ? `Pasted · ${lang.name}` : 'You say'}</small>
              {u >= TR_DONE ? (
                <span lang={lang.lang} style={fade(u, TR_DONE)}>
                  {lang.text}
                </span>
              ) : (
                <span style={{ opacity: u > 0.5 ? 1 : 0.2 }}>
                  “See you at the station tomorrow morning.”
                </span>
              )}
            </div>
            <Pill width={width} visible={u < TR_DONE + 0.6}>
              {content}
            </Pill>
            <div className="translate-keys" aria-hidden="true">
              <span>Switch language</span>
              <KeyCap name="Shift" down={shiftDown} />
              <span>or click the name</span>
            </div>
          </div>
        )
      }}
    </Stage>
  )
}

/* ─── Ask anything: highlight, ask, answer panel above the pill ─── */

const ASK_SEL = 1.2
const ASK_REC = 1.5
const ASK_THINK = 3.9
const ASK_ANSWER = 5.0
const ASK_END = 10.5

export function AskVignette({ keys }: { keys?: KeySignal }) {
  return (
    <Stage
      duration={12}
      restAt={7}
      className="vignette desk"
      label="Animation: text is highlighted, the question “Summarise this in one line” is spoken, and the answer appears in a glass panel above the pill."
    >
      {({ t }) => {
        const hl = t < ASK_END ? easeInOut(progress(t, 0.2, ASK_SEL)) * 100 : 0
        const speaking = speechBetween(ASK_REC + 0.3, ASK_THINK - 0.3)
        const showPill = t >= ASK_REC && t < ASK_ANSWER
        const panel = t >= ASK_ANSWER && t < ASK_END
        // The panel rises on a spring: it overshoots a touch and settles.
        const rise = spring(t - ASK_ANSWER)
        const p = easeOut(progress(t, ASK_ANSWER, ASK_ANSWER + 0.2))
        const down =
          (t >= ASK_REC - 0.22 && t < ASK_REC) || (t >= ASK_THINK - 0.22 && t < ASK_THINK)
        const out = 1 - progress(t, ASK_END - 0.3, ASK_END)
        let width = 320
        let content
        if (t < ASK_THINK) {
          content = (
            <>
              <Aurora mode="listening" t={t} level={speaking(t) * 0.8} />
              <PillRecording
                t={t}
                seed={5}
                speaking={speaking}
                icon={<PillAskIcon />}
                extra={<span className="pill-chip-about">About “It listens while…”</span>}
              />
            </>
          )
        } else {
          width = WORKING_WIDTH
          content = (
            <>
              <Aurora mode="working" t={t} since={ASK_THINK} />
              <PillWorking label="Thinking" />
            </>
          )
        }
        return (
          <div className="ask-demo">
            <KeySync signal={keys} down={down} />
            <div className="ask-doc" aria-hidden="true">
              Typelite is a voice keyboard for macOS.{' '}
              <mark style={{ '--hl': `${hl}%` } as CSSProperties}>
                It listens while you hold a shortcut, turns your speech into text, cleans it up and
                pastes it wherever you are typing, with models that can run on your own computer.
              </mark>
            </div>
            <div className="ask-stack">
              {panel && (
                <section
                  className="ask-glass"
                  aria-label="Ask answer"
                  style={{
                    opacity: p * out,
                    transform: `translateY(${((1 - rise) * 22).toFixed(2)}px) scale(${(0.94 + 0.06 * rise).toFixed(4)})`,
                  }}
                >
                  <div className="ask-head">
                    <span className="ask-question">
                      About the highlight · <b>Summarise this in one line</b>
                    </span>
                    <span className="ask-close" aria-hidden="true">
                      <IconX size={12} />
                    </span>
                  </div>
                  <div className="ask-answer">
                    Typelite turns your speech into clean text in any app, using models on your own
                    computer.
                  </div>
                  <div className="ask-foot">
                    <span className="ask-hint">
                      <kbd>Esc</kbd> to close
                    </span>
                    <span className="ask-btn">Copy</span>
                    <span className="ask-btn ask-btn-primary">Insert</span>
                  </div>
                </section>
              )}
              <div
                className="ask-said"
                style={{ opacity: t > ASK_REC + 0.4 && t < ASK_THINK + 0.4 ? 1 : 0 }}
              >
                “Summarise this in one line”
              </div>
              <Pill width={width} visible={showPill} className="pill-shrinkable">
                {content}
              </Pill>
            </div>
          </div>
        )
      }}
    </Stage>
  )
}
