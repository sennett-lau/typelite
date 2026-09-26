import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { easeOut, progress, useReducedMotion } from '../lib/clock'
import {
  Aurora,
  Pill,
  PillDone,
  PillRecording,
  PillWorking,
  RECORDING_WIDTH,
  WORKING_WIDTH,
} from '../components/Pill'
import { Stage } from '../components/Stage'
import { KeyCap } from '../components/KeyCap'

/**
 * "How it works", told by scrolling: the section is tall and its content sticks to the screen
 * while you scroll through it. Scroll progress picks the step (listen → transcribe → polish →
 * paste) and scrubs what happens inside it; the pill's own motion (waveform, sweep) runs on
 * the demo clock. With reduced motion the section is a plain list and the stage shows the end.
 */

const STEPS = [
  {
    title: 'Press and speak',
    body: 'Press Fn and talk. The pill listens, and a quick check makes sure it heard a voice, not a key click.',
  },
  {
    title: 'Transcribe',
    body: 'Speech recognition turns your audio into words, on your computer or on a server you choose.',
  },
  {
    title: 'Polish',
    body: 'A small language model drops the fillers, applies your corrections and adds punctuation.',
  },
  {
    title: 'Paste',
    body: 'The clean text is pasted where your cursor is, and your clipboard is put back as it was.',
  },
]

const RAW = '~um ~so the launch notes are ready ~uh we can ship on ~thursday ~no friday'
  .split(' ')
  .map((w) => (w.startsWith('~') ? { w: w.slice(1), cut: true } : { w, cut: false }))
const CLEAN = 'The launch notes are ready, we can ship on Friday.'

/** 0 → 1 as the tall track scrolls past the sticky viewport. Updated once per frame. */
function useTrackProgress(ref: RefObject<HTMLElement | null>, enabled: boolean): number {
  const [p, setP] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let raf = 0
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const sticky = el.firstElementChild as HTMLElement | null
      const span = r.height - (sticky?.offsetHeight ?? window.innerHeight)
      const top = sticky ? parseFloat(getComputedStyle(sticky).top) || 0 : 0
      const next = span > 0 ? Math.min(1, Math.max(0, (top - r.top) / span)) : 0
      setP((prev) => (Math.abs(prev - next) > 0.0005 ? next : prev))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [ref, enabled])
  return p
}

export function Story() {
  const track = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const scrolled = useTrackProgress(track, !reduced)
  // A little dwell at both ends, so the first and last steps are not cut short.
  const p = reduced ? 1 : Math.min(1, Math.max(0, (scrolled - 0.04) / 0.9))
  const step = Math.min(3, Math.floor(p * 4))
  const sub = reduced ? 1 : Math.min(1, p * 4 - step)

  return (
    <section className={`story ${reduced ? 'story-static' : ''}`} id="how" aria-labelledby="how-title">
      <div className="story-track" ref={track}>
        <div className="story-sticky">
          <div className="container story-grid">
            <div className="story-copy">
              <span className="eyebrow">How it works</span>
              <h2 className="section-title story-title" id="how-title">
                From your voice to finished text.
              </h2>
              <div className="story-meter" aria-hidden="true">
                {STEPS.map((s, i) => (
                  <i key={s.title} className={i <= step ? 'on' : undefined}>
                    <b style={{ transform: `scaleX(${i < step ? 1 : i === step ? sub : 0})` }} />
                  </i>
                ))}
              </div>
              <ol className="story-steps">
                {STEPS.map((s, i) => (
                  <li
                    key={s.title}
                    className={`${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`}
                    aria-current={!reduced && i === step ? 'step' : undefined}
                  >
                    <span className="story-num" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div>
                      <h3>{s.title}</h3>
                      <p>{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <Stage
              duration={60}
              restAt={2}
              className="story-stage"
              controlsLeft
              label="Animation, driven by scrolling: you press Fn and speak, the pill transcribes and polishes, and the clean sentence is pasted into a note."
            >
              {({ t }) => <StoryFrame t={t} step={step} sub={sub} />}
            </Stage>
          </div>
        </div>
      </div>
    </section>
  )
}

function StoryFrame({ t, step, sub }: { t: number; step: number; sub: number }) {
  const n = RAW.length
  // Step 1: words arrive as you scroll. Step 3: the cut words are struck through one by one.
  const heard = step === 0 ? Math.floor(sub * (n + 2)) - 1 : n
  const cutOrder = RAW.map((w, i) => (w.cut ? i : -1)).filter((i) => i >= 0)
  const struck = step < 2 ? 0 : step === 2 ? Math.floor(sub * (cutOrder.length + 1)) : cutOrder.length
  const struckSet = new Set(cutOrder.slice(0, struck))

  const pasted = step === 3
  const land = pasted ? easeOut(progress(sub, 0.05, 0.55)) : 0
  const cardOut = pasted ? easeOut(progress(sub, 0, 0.45)) : 0
  const pillVisible = !(pasted && sub > 0.7)
  const keyDown = (step === 0 && sub < 0.08) || (step === 1 && sub < 0.08)

  let width = RECORDING_WIDTH
  let pill
  if (step === 0) {
    const speaking = (time: number) => (time < 0 ? 0 : Math.min(1, 0.35 + 0.65 * Math.min(1, sub * 3)))
    pill = (
      <>
        <Aurora mode="listening" t={t} level={0.7} />
        <PillRecording t={t} speaking={speaking} seed={4} />
      </>
    )
  } else if (step < 3) {
    width = WORKING_WIDTH
    pill = (
      <>
        <Aurora mode="working" t={t} since={0} />
        <PillWorking key={step} label={step === 1 ? 'Transcribing' : 'Polishing'} />
      </>
    )
  } else {
    width = WORKING_WIDTH
    pill = (
      <>
        {/* The flash plays over the first part of the step, scrubbed by scroll. */}
        <Aurora mode="done" t={sub * 1.2} since={0} />
        <PillDone />
      </>
    )
  }

  const card: CSSProperties = {
    opacity: 1 - cardOut,
    transform: `translateY(${-cardOut * 36}px) scale(${1 - cardOut * 0.04})`,
  }
  const typed: CSSProperties = {
    opacity: land,
    filter: land < 1 ? `blur(${((1 - land) * 6).toFixed(2)}px)` : undefined,
    transform: `translateY(${((1 - land) * 14).toFixed(2)}px)`,
  }

  return (
    <div className="screen story-screen" aria-hidden="true">
      <div className="key-hint story-key">
        <span>Dictate</span>
        <KeyCap name="Fn" down={keyDown} />
      </div>
      <div className="win story-win">
        <div className="win-bar">
          <span className="lights">
            <i />
            <i />
            <i />
          </span>
          <span>Notes</span>
        </div>
        <div className="story-doc">
          <b>Launch plan</b>
          <p>Onboarding finished and tested.</p>
          <p>Pricing table updated.</p>
          <p className="story-line">
            {land > 0 ? (
              <span className={`typed ${sub < 0.8 ? 'flash' : ''}`} style={typed}>
                {CLEAN}
              </span>
            ) : null}
            <span className="caret" style={{ opacity: Math.floor(t * 1.8) % 2 === 0 ? 1 : 0 }} />
          </p>
        </div>
      </div>
      <div className="story-dock">
        <div className="card story-card" style={card}>
          <span className="caption-label">{step === 2 ? 'Polishing' : 'You say'}</span>
          <p>
            {RAW.map((word, i) => (
              <span key={i}>
                <span
                  className={`word ${i > heard ? 'pending' : ''} ${struckSet.has(i) ? 'cut' : ''}`}
                >
                  {word.w}
                </span>{' '}
              </span>
            ))}
          </p>
          {step === 1 && <span className="story-sweep" style={{ transform: `translateX(${((t % 1.4) / 1.4) * 260 - 100}%)` }} />}
        </div>
        <Pill width={width} visible={pillVisible}>
          {pill}
        </Pill>
      </div>
    </div>
  )
}
