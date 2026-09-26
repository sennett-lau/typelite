import type { CSSProperties, ReactNode } from 'react'
import { KeyCap } from '../components/KeyCap'
import { AskVignette, DictateVignette, TranslateVignette } from '../demos/Vignettes'
import { IconCheck, IconGlobe, IconMic, IconSparkle } from '../components/Icons'

function Feature({
  color,
  icon,
  tag,
  title,
  children,
  points,
  keys,
  demo,
  flip = false,
}: {
  color: string
  icon: ReactNode
  tag: string
  title: string
  children: ReactNode
  points: string[]
  keys: string[]
  demo: ReactNode
  flip?: boolean
}) {
  return (
    <article
      className={`card feature ${flip ? 'flip' : ''}`}
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
        <ul className="feature-points">
          {points.map((p) => (
            <li key={p}>
              <IconCheck size={15} />
              {p}
            </li>
          ))}
        </ul>
        <div className="keys">
          {keys.map((k, i) => (
            <span key={k} className="key-join">
              {i > 0 && <span aria-hidden="true">+</span>}
              <KeyCap name={k} />
            </span>
          ))}
          <span className="keys-note">by default · any keys you like</span>
        </div>
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
        <div className="feature-list">
          <Feature
            color="var(--f-dictate)"
            icon={<IconMic size={16} />}
            tag="Dictate"
            title="Speak messy, get clean text."
            points={[
              'Fillers and repeated words removed',
              '“No, actually…” corrections applied',
              'Punctuation and capitals added',
            ]}
            keys={['Fn']}
            demo={<DictateVignette />}
          >
            Talk the way you talk. Typelite writes it the way you would have typed it, and pastes it
            where your cursor is.
          </Feature>
          <Feature
            flip
            color="var(--f-translate)"
            icon={<IconGlobe size={16} />}
            tag="Translate"
            title="Say it, get it in another language."
            points={[
              'Up to three target languages',
              'Switch mid-sentence with Shift or a click on the pill',
              'Highlight text to translate it in place',
            ]}
            keys={['Fn', 'LeftShift']}
            demo={<TranslateVignette />}
          >
            Speak in your own language and the text arrives in the one you need. The recording keeps
            going while you switch.
          </Feature>
          <Feature
            color="var(--f-ask)"
            icon={<IconSparkle size={16} />}
            tag="Ask anything"
            title="Ask about what you’ve highlighted."
            points={[
              'Questions answered in a glass panel above the pill',
              '“Make this shorter” edits the highlight',
              'Copy or insert the answer with one click',
            ]}
            keys={['Fn', 'Space']}
            demo={<AskVignette />}
          >
            Highlight a paragraph and ask for a summary, a rewrite or an explanation, without
            leaving the app you’re in.
          </Feature>
        </div>
      </div>
    </section>
  )
}
