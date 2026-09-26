import { useState, type CSSProperties } from 'react'
import { easeInOut, easeOut, progress } from '../lib/clock'
import { IconArrowRight, IconX } from '../components/Icons'
import {
  Aurora,
  Pill,
  PillAskIcon,
  PillCopy,
  PillDone,
  PillRecording,
  PillWorking,
  RECORDING_WIDTH,
  WORKING_WIDTH,
  speechBetween,
} from '../components/Pill'
import { Stage } from '../components/Stage'

const fade = (t: number, at: number, len = 0.3): CSSProperties => {
  const p = easeOut(progress(t, at, at + len))
  return { opacity: p, transform: `translateY(${(1 - p) * 6}px)` }
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

export function DictateVignette() {
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
        return (
          <div className="clean-demo">
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
  { name: 'Français', short: 'FR', text: 'À demain matin à la gare.', width: 56, lang: 'fr' },
  { name: '日本語', short: '日', text: '明日の朝、駅で会いましょう。', width: 38, lang: 'ja' },
  {
    name: 'Español',
    short: 'ES',
    text: 'Nos vemos mañana por la mañana en la estación.',
    width: 52,
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
  return Math.max(RECORDING_WIDTH, fixed + nameWidth + 8 + (dots * 6 + (dots - 1) * 4) + 8)
}

export function TranslateVignette() {
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
                      className="pill-lang-name pill-lang-switch"
                      style={{ width: lang.width }}
                      lang={lang.lang}
                      aria-label={`Translating into ${lang.name}. Click to switch language.`}
                      onClick={() => setExtra((x) => x + 1)}
                    >
                      {lang.name}
                    </button>
                    <span className="pill-lang-dots" aria-hidden="true">
                      {LANGS.map((l, k) => (
                        <i key={l.name} className={k === active ? 'on' : undefined} />
                      ))}
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
        return (
          <div className="translate-demo">
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
              <kbd className={`kbd ${shiftDown ? 'is-down' : ''}`}>⇧</kbd>
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

export function AskVignette() {
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
        const p = easeOut(progress(t, ASK_ANSWER, ASK_ANSWER + 0.26))
        const out = 1 - progress(t, ASK_END - 0.3, ASK_END)
        let width = 300
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
                    transform: `translateY(${(1 - p) * 8}px) scale(${0.97 + 0.03 * p})`,
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

/* ─── Copy pill: nowhere to paste ─── */

const CP_STOP = 2.4
const CP_OFFER = 3.2
const CP_CLICK = 6.2
const CP_HIDE = 7.2

export function CopyVignette() {
  return (
    <Stage
      duration={8.4}
      restAt={4.4}
      className="vignette desk"
      label="Animation: with no text field focused, the result stays in the pill with a Copy button whose border counts down."
    >
      {({ t }) => {
        const speaking = speechBetween(0.5, CP_STOP - 0.3)
        let width = RECORDING_WIDTH
        let content
        if (t < CP_STOP) {
          content = (
            <>
              <Aurora mode="listening" t={t} level={speaking(t) * 0.8} />
              <PillRecording t={t} seed={7} speaking={speaking} />
            </>
          )
        } else if (t < CP_OFFER) {
          width = WORKING_WIDTH
          content = (
            <>
              <Aurora mode="working" t={t} since={CP_STOP} />
              <PillWorking label="Polishing" />
            </>
          )
        } else {
          width = 308
          const remaining = 1 - Math.min(1, (t - CP_OFFER) / 8)
          content = (
            <PillCopy
              text="Remind me to call the dentist on Monday at 10."
              remaining={remaining}
              copied={t >= CP_CLICK}
            />
          )
        }
        return (
          <div className="copy-demo">
            <span className="copy-toast" style={{ opacity: t >= CP_OFFER && t < CP_HIDE ? 1 : 0 }}>
              No text field has focus
            </span>
            <Pill width={width} visible={t > 0.25 && t < CP_HIDE} className="pill-shrinkable">
              {content}
            </Pill>
          </div>
        )
      }}
    </Stage>
  )
}

/* ─── The pill follows your screen ─── */

export function FollowVignette() {
  return (
    <Stage
      duration={8}
      restAt={2.5}
      className="vignette plain"
      label="Animation: the pointer moves from a laptop screen to an external display, and the pill appears on the screen you are working on."
    >
      {({ t }) => {
        // 0-3 left, 3-4 move right, 4-7 right, 7-8 move back.
        const toRight = easeInOut(progress(t, 3, 4)) * (1 - easeInOut(progress(t, 7, 8)))
        const x = 25 + (73 - 25) * toRight
        const y = 50 - 10 * Math.sin(Math.PI * toRight)
        const onRight = toRight > 0.5
        return (
          <div className="monitors-box" aria-hidden="true">
            <div className={`monitor m-left ${onRight ? '' : 'active'}`}>
              <div className="mini-win" />
              <div className={`mini-pill ${onRight ? 'gone' : ''}`} />
            </div>
            <div className={`monitor m-right ${onRight ? 'active' : ''}`}>
              <div className="mini-win" />
              <div className={`mini-pill ${onRight ? '' : 'gone'}`} />
            </div>
            <svg className="pointer" viewBox="0 0 18 18" style={{ left: `${x}%`, top: `${y}%` }}>
              <path
                d="M2 1.5v13l3.6-3.3 2.4 5.3 2.3-1-2.4-5.2H13L2 1.5Z"
                fill="#111"
                stroke="#fff"
                strokeWidth="1.2"
              />
            </svg>
          </div>
        )
      }}
    </Stage>
  )
}

/* ─── Insights ─── */

const PRESETS = [
  { name: 'Ollama · qwen3:4b', runs: 26, s: 0.42 },
  { name: 'Built-in · Qwen3 1.7B', runs: 8, s: 0.61 },
  { name: 'Cloud · llama-3.1-8b', runs: 4, s: 0.88 },
]

export function InsightsVignette() {
  return (
    <Stage
      duration={9}
      restAt={8}
      className="vignette plain"
      label="Animation: Insights shows speaking at 142 words per minute against typing at 48, three times faster, and compares AI presets by average time."
    >
      {({ t }) => {
        const c = easeOut(progress(t, 0.2, 1.6))
        const bars = easeOut(progress(t, 0.8, 2.2))
        const max = Math.max(...PRESETS.map((p) => p.s))
        return (
          <div className="insights">
            <div className="wpm">
              <div className="stat">
                <span className="lab">Speaking</span>
                <span className="num">
                  {Math.round(142 * c)}
                  <small>WPM</small>
                </span>
              </div>
              <div className="stat">
                <span className="lab">Typing</span>
                <span className="num">
                  {Math.round(48 * c)}
                  <small>WPM</small>
                </span>
              </div>
              <div className="x" style={{ opacity: progress(t, 1.2, 1.7) }}>
                3.0×<small>faster than typing</small>
              </div>
            </div>
            <div className="prows">
              <h4>Compare presets · AI polish</h4>
              {PRESETS.map((p, i) => (
                <div className="prow" key={p.name}>
                  <span className="nm" title={p.name}>
                    {p.name}
                    {i === 0 && <span className="fastest">Fastest</span>}
                  </span>
                  <span className="bb">
                    <i style={{ width: `${(p.s / max) * 100 * bars}%` }} />
                  </span>
                  <span className="t">{p.s.toFixed(2)} s</span>
                </div>
              ))}
            </div>
          </div>
        )
      }}
    </Stage>
  )
}
