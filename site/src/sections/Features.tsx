import type { CSSProperties, ReactNode } from 'react'
import { KeyCap } from '../components/KeyCap'
import {
  AskVignette,
  CopyVignette,
  DictateVignette,
  FollowVignette,
  InsightsVignette,
  TranslateVignette,
} from '../demos/Vignettes'
import {
  IconClipboard,
  IconGauge,
  IconGlobe,
  IconMic,
  IconMonitor,
  IconSparkle,
} from '../components/Icons'

function Keys({ keys }: { keys: string[] }) {
  return (
    <>
      {keys.map((k, i) => (
        <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {i > 0 && <span aria-hidden="true">+</span>}
          <KeyCap name={k} />
        </span>
      ))}
    </>
  )
}

function Feature({
  color,
  icon,
  tag,
  title,
  children,
  keys,
  wide = false,
  demo,
}: {
  color: string
  icon: ReactNode
  tag: string
  title: string
  children: ReactNode
  keys?: string[]
  wide?: boolean
  demo: ReactNode
}) {
  return (
    <article
      className={`card feature ${wide ? 'wide' : ''}`}
      style={{ '--fc': color } as CSSProperties}
      data-reveal
    >
      <div className="feature-copy">
        <span className="feature-tag">
          <span className="feature-icon">{icon}</span>
          {tag}
        </span>
        <h3>{title}</h3>
        <p>{children}</p>
        {keys && (
          <div className="keys">
            <Keys keys={keys} />
            <span style={{ marginLeft: 6 }}>by default, change it any time</span>
          </div>
        )}
      </div>
      {demo}
    </article>
  )
}

export function Features() {
  return (
    <section className="section" id="features" aria-labelledby="features-title">
      <div className="container">
        <div className="section-head center" data-reveal>
          <span className="eyebrow">Features</span>
          <h2 className="section-title" id="features-title">
            Three shortcuts. Every app.
          </h2>
          <p className="section-lead">
            Dictate, translate or ask, from whatever you’re typing in. A small pill at the bottom of
            your screen shows what’s happening and never steals focus.
          </p>
        </div>
        <div className="feature-grid">
          <Feature
            wide
            color="var(--f-dictate)"
            icon={<IconMic size={16} />}
            tag="Dictate"
            title="Speak messy, get clean text."
            keys={['Fn']}
            demo={<DictateVignette />}
          >
            Fillers out, self-corrections applied, punctuation in. Talk the way you talk; Typelite
            writes it the way you would have typed it.
          </Feature>
          <Feature
            wide
            color="var(--f-translate)"
            icon={<IconGlobe size={16} />}
            tag="Translate"
            title="Say it, get it in another language."
            keys={['Fn', 'LeftShift']}
            demo={<TranslateVignette />}
          >
            Up to three target languages. Press Shift or click the language on the pill to switch
            while you’re still speaking; the recording keeps going. Highlight text to translate it
            in place.
          </Feature>
          <Feature
            wide
            color="var(--f-ask)"
            icon={<IconSparkle size={16} />}
            tag="Ask anything"
            title="Ask about what you’ve highlighted."
            keys={['Fn', 'Space']}
            demo={<AskVignette />}
          >
            Ask a question, or highlight text and say “make this shorter”. Answers appear in a small
            glass panel above the pill, with Copy and Insert.
          </Feature>
          <Feature
            wide
            color="var(--accent)"
            icon={<IconClipboard size={16} />}
            tag="Copy pill"
            title="Nowhere to paste? It waits for you."
            demo={<CopyVignette />}
          >
            When no text field has focus, the result stays in the pill with a Copy button. Its
            border counts down; hover to keep it, Esc to close.
          </Feature>
          <Feature
            color="var(--accent)"
            icon={<IconMonitor size={16} />}
            tag="Multi-monitor"
            title="The pill follows your screen."
            demo={<FollowVignette />}
          >
            It shows up at the bottom of the display you’re working on, and never takes focus from
            your app. Esc cancels.
          </Feature>
          <Feature
            color="var(--f-ask)"
            icon={<IconGauge size={16} />}
            tag="Insights"
            title="See how much faster you are."
            demo={<InsightsVignette />}
          >
            How fast you speak compared with how fast you type, how long it takes from the end of
            your speech to the text, and how your presets compare. Timings only, never what you
            said.
          </Feature>
          <article className="card feature" data-reveal>
            <div className="feature-copy">
              <span className="feature-tag">
                <span className="feature-icon">
                  <IconSparkle size={16} />
                </span>
                And more
              </span>
              <h3>Made for real work.</h3>
              <ul className="more-list">
                <li>Hold-to-talk or tap-to-toggle, on any keys</li>
                <li>Your own dictionary of names and terms</li>
                <li>Guided setup with a hands-on tutorial</li>
                <li>Esc cancels at any moment</li>
                <li>Light and dark, like macOS</li>
              </ul>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
