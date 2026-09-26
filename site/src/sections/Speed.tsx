import { easeOut, progress } from '../lib/clock'
import { Stage } from '../components/Stage'
import { IconMic } from '../components/Icons'

/**
 * "Faster than typing": one minute of typing against one minute of speaking, sped up. The rates
 * are conservative round numbers from the sources in the footnote.
 */
const TYPING_WPM = 50
const SPEAKING_WPM = 150
/** Seconds of animation for one minute of writing, then a pause. */
const RUN = 10
const DURATION = 14

const PASSAGE =
  'Quick update on the launch. The new onboarding is finished and tested, and the feedback from ' +
  'the pilot group was really positive. Two small things are left: the help page needs new ' +
  'screenshots, and the pricing table still shows last year’s plans. I can fix the table today. ' +
  'Could you take the screenshots, or should I ask the design team? If we get both done by ' +
  'Thursday, we can send the announcement on Friday morning as planned. I’ll also draft the ' +
  'email to existing customers so you can review it before lunch. One more thing: the support ' +
  'team asked for a short list of the changes, so they can answer questions on launch day. I’ll ' +
  'put that together this afternoon and share it in the channel. Let me know if anything looks ' +
  'off, or if you think we should move the date. Otherwise, I think we are in good shape. Thanks ' +
  'again for all the help this week, it made a real difference to the whole team.'
const WORDS = PASSAGE.split(' ')

function Lane({
  label,
  icon,
  wpm,
  words,
  color,
  caret,
}: {
  label: string
  icon: React.ReactNode
  wpm: number
  words: number
  color: string
  caret: boolean
}) {
  const shown = WORDS.slice(0, Math.floor(words)).join(' ')
  return (
    <div className="lane" style={{ '--lane': color } as React.CSSProperties}>
      <div className="lane-head">
        <span className="lane-label">
          {icon}
          {label}
        </span>
        <span className="lane-count">
          <b>{Math.floor(words)}</b> words
        </span>
      </div>
      <div className="lane-bar" aria-hidden="true">
        <i style={{ width: `${(words / SPEAKING_WPM) * 100}%` }} />
      </div>
      <div className="lane-text" aria-hidden="true">
        <p>
          {shown}
          {caret && <span className="caret" />}
        </p>
      </div>
      <span className="lane-rate">about {wpm} words per minute</span>
    </div>
  )
}

export function Speed() {
  return (
    <section className="section" id="faster" aria-labelledby="faster-title">
      <div className="container">
        <div className="section-head center" data-reveal>
          <span className="eyebrow">Faster than typing</span>
          <h2 className="section-title" id="faster-title">
            You speak about three times faster than you type.
          </h2>
          <p className="section-lead">
            Most people type around {TYPING_WPM} words a minute and speak around {SPEAKING_WPM}.
            Typelite turns that speed into finished text, so what you say is ready to send, without
            the ums or the retyping.
          </p>
        </div>
        <Stage
          duration={DURATION}
          restAt={RUN + 1}
          className="card race hero-stage"
          label={`Animation: one minute of writing, sped up. Typing reaches about ${TYPING_WPM} words; speaking reaches about ${SPEAKING_WPM}.`}
        >
          {({ t }) => {
            const p = progress(t, 0.3, RUN)
            const done = t >= RUN
            const badge = easeOut(progress(t, RUN, RUN + 0.5))
            return (
              <>
                <div className="race-top">
                  <span className="caption-label">One minute of writing, sped up</span>
                  <span className="race-clock">
                    0:{String(Math.min(60, Math.floor(p * 60))).padStart(2, '0')}
                  </span>
                </div>
                <div className="lanes">
                  <Lane
                    label="Typing"
                    icon={<KeyboardIcon />}
                    wpm={TYPING_WPM}
                    words={TYPING_WPM * p}
                    color="var(--text-3)"
                    caret={!done && Math.floor(t * 2) % 2 === 0}
                  />
                  <Lane
                    label="Speaking with Typelite"
                    icon={<IconMic size={16} />}
                    wpm={SPEAKING_WPM}
                    words={SPEAKING_WPM * p}
                    color="var(--accent)"
                    caret={false}
                  />
                </div>
                <div
                  className="race-result"
                  style={{ opacity: badge, transform: `translateY(${(1 - badge) * 6}px)` }}
                >
                  <span className="race-x">about 3×</span>
                  as many words in the same minute
                </div>
              </>
            )
          }}
        </Stage>
        <p className="race-note" data-reveal>
          Typelite shows your own speaking and typing speeds in Insights, kept on your computer.
        </p>
        <p className="footnote" data-reveal>
          Rates are rounded down and vary from person to person. Typing: an average of 52 words per
          minute across 168,000 volunteers (
          <a href="https://userinterfaces.aalto.fi/136Mkeystrokes/resources/chi-18-analysis.pdf">
            Dhakal et al., CHI 2018
          </a>
          ). Speaking: about 196 words per minute measured in telephone conversations (
          <a href="https://www.isca-archive.org/interspeech_2006/yuan06_interspeech.html">
            Yuan, Liberman and Cieri, Interspeech 2006
          </a>
          ) and 153 for English speech input on a phone (
          <a href="https://arxiv.org/abs/1608.07323">Ruan et al., 2016</a>); we use a conservative
          150.
        </p>
      </div>
    </section>
  )
}

function KeyboardIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 15h6" />
    </svg>
  )
}
