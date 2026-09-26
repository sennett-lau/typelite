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

/** A damped spring from 0 to 1 over `x` seconds. */
function spring(x: number): number {
  if (x <= 0) return 0
  return 1 - Math.exp(-x * 8) * Math.cos(x * 13)
}

/** The finishing burst: small aurora sparks flying out from the speaking count. */
const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1)
  return { angle, dist: 34 + ((i * 37) % 5) * 7, size: 4 + (i % 3) }
})

function Sparks({ since }: { since: number }) {
  if (since < 0 || since > 0.9) return null
  const k = easeOut(since / 0.9)
  return (
    <span className="sparks" aria-hidden="true">
      {SPARKS.map((sp, i) => (
        <i
          key={i}
          style={{
            width: sp.size,
            height: sp.size,
            opacity: 1 - k,
            transform: `translate(${(Math.cos(sp.angle) * sp.dist * k).toFixed(1)}px, ${(Math.sin(sp.angle) * sp.dist * k).toFixed(1)}px) scale(${(1 - 0.6 * k).toFixed(3)})`,
            background: i % 2 ? 'var(--aurora-b)' : 'var(--aurora-a)',
          }}
        />
      ))}
    </span>
  )
}

function Lane({
  label,
  icon,
  wpm,
  words,
  color,
  caret,
  lead,
  finished = -1,
}: {
  label: string
  icon: React.ReactNode
  wpm: number
  words: number
  color: string
  caret: boolean
  /** Words ahead of typing (the speaking lane only). */
  lead?: number
  /** Seconds since the minute ended, or -1 before. */
  finished?: number
}) {
  const shown = WORDS.slice(0, Math.floor(words)).join(' ')
  const pop =
    finished >= 0
      ? 1 + 0.18 * Math.max(0, 1 - finished / 0.5) * Math.sin(Math.min(1, finished / 0.5) * Math.PI)
      : 1
  return (
    <div
      className={`lane ${finished >= 0 ? 'lane-done' : ''}`}
      style={{ '--lane': color } as React.CSSProperties}
    >
      {finished >= 0 && finished < 1.2 && (
        <span className="lane-sheen-clip" aria-hidden="true">
          <span
            className="lane-sheen"
            style={{
              transform: `translateX(${(-100 + 300 * easeOut(finished / 1.2)).toFixed(1)}%)`,
            }}
          />
        </span>
      )}
      <div className="lane-head">
        <span className="lane-label">
          {icon}
          {label}
        </span>
        <span className="lane-count">
          {lead !== undefined && lead > 0 && <span className="lane-lead">+{lead} ahead</span>}
          <span className="lane-num">
            <b style={pop !== 1 ? { transform: `scale(${pop.toFixed(3)})` } : undefined}>
              {Math.floor(words)}
            </b>
            <Sparks since={finished} />
          </span>{' '}
          words
        </span>
      </div>
      <div className="lane-bar" aria-hidden="true">
        <i style={{ transform: `scaleX(${(words / SPEAKING_WPM).toFixed(4)})` }} />
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
          restAt={RUN + 2}
          className="card race hero-stage"
          label={`Animation: one minute of writing, sped up. Typing reaches about ${TYPING_WPM} words; speaking reaches about ${SPEAKING_WPM}.`}
        >
          {({ t }) => {
            const p = progress(t, 0.3, RUN)
            const done = t >= RUN
            const badge = easeOut(progress(t, RUN, RUN + 0.3))
            const badgeScale = 0.6 + 0.4 * spring(t - RUN - 0.15)
            const finished = done ? t - RUN : -1
            const seconds = Math.min(60, Math.floor(p * 60))
            const tick = done ? Math.max(0, 1 - (t - RUN) / 0.4) : 0
            return (
              <>
                <div className="race-top">
                  <span className="caption-label">One minute of writing, sped up</span>
                  <span
                    className={`race-clock ${done ? 'is-done' : ''}`}
                    style={
                      tick ? { transform: `scale(${(1 + 0.15 * tick).toFixed(3)})` } : undefined
                    }
                  >
                    {seconds === 60 ? '1:00' : `0:${String(seconds).padStart(2, '0')}`}
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
                    lead={Math.floor(SPEAKING_WPM * p) - Math.floor(TYPING_WPM * p)}
                    finished={finished}
                  />
                </div>
                <div
                  className="race-result"
                  style={{ opacity: badge, transform: `translateY(${(1 - badge) * 6}px)` }}
                >
                  <span
                    className="race-x"
                    style={{ transform: `scale(${done ? badgeScale.toFixed(3) : 0.6})` }}
                  >
                    about 3×
                  </span>
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
          <a
            rel="noopener"
            href="https://userinterfaces.aalto.fi/136Mkeystrokes/resources/chi-18-analysis.pdf"
          >
            Dhakal et al., CHI 2018
          </a>
          ). Speaking: about 196 words per minute measured in telephone conversations (
          <a
            rel="noopener"
            href="https://www.isca-archive.org/interspeech_2006/yuan06_interspeech.html"
          >
            Yuan, Liberman and Cieri, Interspeech 2006
          </a>
          ) and 153 for English speech input on a phone (
          <a rel="noopener" href="https://arxiv.org/abs/1608.07323">
            Ruan et al., 2016
          </a>
          ); we use a conservative 150.
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
