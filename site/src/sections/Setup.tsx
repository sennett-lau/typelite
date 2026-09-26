import { easeInOut, easeOut, progress } from '../lib/clock'
import { Stage } from '../components/Stage'
import { IconArrowRight, IconDownload } from '../components/Icons'
import { links } from '../links'

const MODELS = [
  {
    what: 'Speech recognition',
    name: 'whisper large-v3-turbo',
    bytes: 574_041_195,
    from: 0.9,
    to: 4.4,
  },
  { what: 'AI polish', name: 'Qwen3 4B Instruct 2507', bytes: 2_497_281_120, from: 1.1, to: 7.2 },
]
const READY = 7.5

/** A check mark that draws itself as `p` goes from 0 to 1. */
function DrawnCheck({ p, size = 14, width = 2.6 }: { p: number; size?: number; width?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4.5 12.5 9.5 17.5 19.5 6.5"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset={(1 - p).toFixed(4)}
      />
    </svg>
  )
}

/** A damped spring from 0 to 1 over `x` seconds. */
function spring(x: number): number {
  if (x <= 0) return 0
  return 1 - Math.exp(-x * 9) * Math.cos(x * 14)
}

function size(bytes: number) {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${Math.round(bytes / 1e6)} MB`
}

const SERVERS = [
  'whisper.cpp server',
  'Speaches',
  'Ollama',
  'LM Studio',
  'llama.cpp server',
  'vLLM',
]
const CLOUD = ['OpenAI', 'Groq', 'OpenRouter', 'Qwen Cloud']

export function Setup() {
  return (
    <section className="section" id="setup" aria-labelledby="setup-title">
      <div className="container">
        <div className="section-head center" data-reveal>
          <span className="eyebrow">Setup</span>
          <h2 className="section-title" id="setup-title">
            One click, or bring your own.
          </h2>
          <p className="section-lead">
            Typelite works in two steps, speech recognition and AI polish, and each runs where you
            choose. Mix them freely.
          </p>
        </div>
        <div className="setup-grid">
          <article className="card setup-card" data-reveal>
            <span className="eyebrow" style={{ marginBottom: 0 }}>
              Built-in
            </span>
            <h3>Everything on your computer.</h3>
            <p>
              No servers to install. On Apple Silicon,{' '}
              <a rel="noopener" href={links.whisper}>
                whisper.cpp
              </a>{' '}
              runs inside the app and{' '}
              <a rel="noopener" href={links.llama}>
                llama.cpp
              </a>
              ’s server ships with it. Models are picked for your hardware and checked against a
              SHA-256 before use.
            </p>
            <Stage
              duration={10.5}
              restAt={9}
              className="dl hero-stage"
              controls={false}
              label="Animation: pressing Set up downloads the speech model (574 MB) and the AI model (2.50 GB), then both are ready."
            >
              {({ t }) => {
                const ready = t >= READY
                return (
                  <>
                    {MODELS.map((m) => {
                      const p = easeInOut(progress(t, m.from, m.to))
                      return (
                        <div className="dl-row" key={m.name}>
                          <div className="dl-top">
                            <b>
                              {m.what} · {m.name}
                            </b>
                            <span>
                              {p >= 1 ? (
                                <span className="dl-ready">
                                  <DrawnCheck p={easeOut(progress(t, m.to, m.to + 0.4))} />
                                  Ready
                                </span>
                              ) : t < m.from ? (
                                size(m.bytes)
                              ) : (
                                `${size(m.bytes * p)} of ${size(m.bytes)}`
                              )}
                            </span>
                          </div>
                          <div className={`track ${p >= 1 ? 'track-done' : ''}`}>
                            <i style={{ transform: `scaleX(${p.toFixed(4)})` }}>
                              {p > 0 && p < 1 && (
                                <b
                                  aria-hidden="true"
                                  style={{
                                    transform: `translateX(${(((t * 0.8) % 1) * 400 - 100).toFixed(1)}%)`,
                                  }}
                                />
                              )}
                            </i>
                          </div>
                        </div>
                      )
                    })}
                    <div className="dl-foot">
                      {ready ? (
                        <span className="ready">
                          <span
                            className="ready-dot"
                            style={{ transform: `scale(${spring(t - READY).toFixed(3)})` }}
                          >
                            <DrawnCheck
                              p={easeOut(progress(t, READY + 0.12, READY + 0.5))}
                              size={12}
                              width={3}
                            />
                          </span>
                          Ready. Press Fn and speak.
                        </span>
                      ) : (
                        <span>{t < 0.9 ? 'About 3 GB, once.' : 'Downloading…'}</span>
                      )}
                      <span
                        className={`btn btn-sm ${t < 0.9 ? 'btn-primary' : 'btn-glass'}`}
                        aria-hidden="true"
                        style={{ transform: t > 0.6 && t < 0.8 ? 'scale(0.96)' : undefined }}
                      >
                        <IconDownload size={15} />
                        {t < 0.9 ? 'Set up' : ready ? 'Done' : 'Setting up'}
                      </span>
                    </div>
                  </>
                )
              }}
            </Stage>
            <ul className="more-list" style={{ marginTop: 0, fontSize: 14.5 }}>
              <li>Speech: whisper large-v3-turbo, or small (190 MB) on smaller Macs</li>
              <li>AI polish: Qwen3 4B Instruct 2507, or Qwen3 1.7B for 8 GB Macs</li>
              <li>Offline once downloaded; nothing leaves your computer</li>
            </ul>
            <a rel="noopener" className="inline-link" href={links.models}>
              Choosing a model <IconArrowRight size={15} />
            </a>
          </article>

          <article className="card setup-card" data-reveal>
            <span className="eyebrow" style={{ marginBottom: 0 }}>
              Bring your own
            </span>
            <h3>Your server, or your own key.</h3>
            <p>
              Prefer a GPU computer on your network, or a cloud key? Typelite talks to any{' '}
              <b>OpenAI-compatible</b> speech or chat server, and to Qwen Cloud’s speech API.
            </p>
            <div className="dl">
              <span className="chip-group-label">On your network</span>
              <div className="chips">
                {SERVERS.map((s) => (
                  <span className="chip" key={s}>
                    {s}
                  </span>
                ))}
                <span className="chip">any OpenAI-compatible server</span>
              </div>
              <span className="chip-group-label">Cloud, with your own key (opt-in)</span>
              <div className="chips">
                {CLOUD.map((s) => (
                  <span className="chip" key={s}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <p className="setup-note">
              Cloud services are used only when you add one with your own key; they then receive
              your audio or text. Nothing leaves your machines otherwise.
            </p>
            <a rel="noopener" className="inline-link" href={links.docs}>
              Read the setup guides <IconArrowRight size={15} />
            </a>
          </article>
        </div>
      </div>
    </section>
  )
}
