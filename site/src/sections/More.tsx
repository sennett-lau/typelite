import { useState } from 'react'
import {
  IconArrowRight,
  IconCard,
  IconCheck,
  IconCode,
  IconCopy,
  IconDoc,
  IconDownload,
  IconEyeOff,
  IconFork,
  IconHistoryOff,
  IconLanguages,
  IconRoute,
  IconStar,
  IconUserOff,
} from '../components/Icons'
import { formatCount, type RepoStats } from '../lib/hooks'
import { links } from '../links'

/* ─── Compare with Typeless (the same facts as the README) ─── */

const COMPARE: [string, string, string][] = [
  ['Source', 'Closed', 'Open source (MIT)'],
  ['Price', 'Free tier and paid plans', 'Free'],
  ['Account', 'Sign-in required', 'None'],
  [
    'Where speech and AI run',
    'The Typeless cloud',
    'On your computer, your own server, or a cloud service you pick',
  ],
  ['Languages', 'Built in', 'Per-language presets from a public library, plus a router'],
  [
    'Translate targets',
    'Up to 3, switch from the pill',
    'Up to 3, switch with a key or the pill while recording',
  ],
]

export function Compare() {
  return (
    <section className="section" id="compare" aria-labelledby="compare-title">
      <div className="container">
        <div className="section-head center" data-reveal>
          <span className="eyebrow">Compare</span>
          <h2 className="section-title" id="compare-title">
            Inspired by Typeless. Built to be yours.
          </h2>
          <p className="section-lead">
            Typeless is a polished commercial product and a great source of ideas. Typelite is for
            people who want to own the whole pipeline and tune it for their languages.
          </p>
        </div>
        <div className="card table-wrap" data-reveal>
          <table>
            <caption className="sr-only">Typeless and Typelite compared</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Aspect</span>
                </th>
                <th scope="col">Typeless</th>
                <th scope="col" className="col-us">
                  Typelite
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map(([k, a, b]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td>{a}</td>
                  <td className="col-us">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="compare-note" data-reveal>
          Based on public information about <a href={links.typeless}>Typeless</a>; it may change.
          Typelite is an independent project and not affiliated with Typeless.
        </p>
      </div>
    </section>
  )
}

/* ─── Open source ─── */

const INSTALL = [
  'git clone https://github.com/sennett-lau/typelite.git',
  'cd typelite',
  'npm ci',
  'npm run build:app          # builds llama-server, then the app bundle',
  'open src-tauri/target/release/bundle/macos/Typelite.app',
]

const CONTRIB = [
  {
    icon: <IconCode size={18} />,
    title: 'Code',
    body: 'Tauri 2 with React and Rust. Fix a bug or build a feature; larger ones start with a short plan.',
    href: links.contributeCode,
  },
  {
    icon: <IconCard size={18} />,
    title: 'Service cards',
    body: 'Document a speech or AI service that already works, so others can connect it in a minute.',
    href: links.contributeCards,
  },
  {
    icon: <IconLanguages size={18} />,
    title: 'Language presets',
    body: 'Speak a language well? Teach Typelite how to write it, in a small Markdown file.',
    href: links.contributePresets,
  },
  {
    icon: <IconDoc size={18} />,
    title: 'Docs',
    body: 'Guides for setups, models and troubleshooting. Clearer docs help everyone.',
    href: links.contributeDocs,
  },
]

export function OpenSource({ stats }: { stats: RepoStats | null }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    const text = INSTALL.map((l) => l.replace(/\s+#.*$/, '')).join('\n')
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      },
      () => {},
    )
  }
  return (
    <section className="section" id="open-source" aria-labelledby="oss-title">
      <div className="container">
        <div className="section-head" data-reveal>
          <span className="eyebrow">Open source</span>
          <h2 className="section-title" id="oss-title">
            MIT licensed. Built in the open.
          </h2>
          <p className="section-lead">
            Every line is on GitHub: read it, build it, change it. Code, service cards, language
            presets and docs are all welcome.
          </p>
        </div>
        <div className="oss">
          <div className="card oss-main" data-reveal>
            <div className="oss-stats">
              <a className="stat-pill" href={links.repo}>
                <IconStar size={16} /> Star
                {stats && stats.stars > 0 && <span>{formatCount(stats.stars)}</span>}
              </a>
              <a className="stat-pill" href={links.forks}>
                <IconFork size={16} /> Fork
                {stats && stats.forks > 0 && <span>{formatCount(stats.forks)}</span>}
              </a>
              <a className="stat-pill" href={links.license}>
                MIT <span>licence</span>
              </a>
            </div>
            <h3 id="install" style={{ fontSize: 22 }}>
              Install from source
            </h3>
            <p className="setup-note" style={{ marginTop: -8 }}>
              There is no signed release yet. You’ll need Rust, Node.js 20+, the Xcode Command Line
              Tools and CMake; details in <a href={links.setup}>CONTRIBUTING.md</a>.
            </p>
            <div className="code">
              <div className="code-head">
                <span>Terminal</span>
                <button type="button" className="code-copy" onClick={copy} aria-live="polite">
                  {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre>
                <code>
                  {INSTALL.map((line) => {
                    const m = line.match(/^(.*?)(\s+#.*)?$/)
                    const cmd = m?.[1] ?? line
                    const comment = m?.[2]
                    return (
                      <span key={line}>
                        <span className="p">$ </span>
                        {cmd}
                        {comment && <span className="c">{comment}</span>}
                        {'\n'}
                      </span>
                    )
                  })}
                </code>
              </pre>
            </div>
            <a className="inline-link" href={links.releases}>
              <IconDownload size={15} /> Releases
            </a>
          </div>
          <div className="contrib-grid">
            {CONTRIB.map((c) => (
              <a className="card contrib" href={c.href} key={c.title} data-reveal>
                <h3>
                  <span className="feature-icon">{c.icon}</span>
                  {c.title}
                </h3>
                <p>{c.body}</p>
                <span className="go">
                  Contribute <IconArrowRight size={14} />
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Privacy ─── */

const PRIVACY = [
  {
    icon: <IconUserOff size={20} />,
    title: 'No account',
    body: 'Nothing to sign up for, nothing to sign in to. Install it and speak.',
  },
  {
    icon: <IconEyeOff size={20} />,
    title: 'No telemetry',
    body: 'No analytics, no tracking. Logs keep timings and errors, never your text.',
  },
  {
    icon: <IconHistoryOff size={20} />,
    title: 'No history of what you say',
    body: 'Audio, transcripts and answers are never stored. Insights keep timings only, and one click clears them.',
  },
  {
    icon: <IconRoute size={20} />,
    title: 'You choose where audio goes',
    body: 'The built-in models, your own server, or a service you picked with your own key. Nowhere else.',
  },
]

export function Privacy() {
  return (
    <section className="section" id="privacy" aria-labelledby="privacy-title">
      <div className="container">
        <div className="section-head center" data-reveal>
          <span className="eyebrow">Privacy</span>
          <h2 className="section-title" id="privacy-title">
            Your voice stays yours.
          </h2>
        </div>
        <div className="privacy-grid">
          {PRIVACY.map((p) => (
            <article className="card privacy-item" key={p.title} data-reveal>
              <span className="feature-icon" style={{ width: 36, height: 36, borderRadius: 10 }}>
                {p.icon}
              </span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Final call to action and footer ─── */

export function Footer() {
  return (
    <>
      <section className="section" style={{ paddingTop: 0 }} aria-labelledby="final-title">
        <div className="container">
          <div className="card final" data-reveal>
            <h2 id="final-title">
              Stop typing. <span className="gradient-text">Just say it.</span>
            </h2>
            <p>Free forever, open source, and it runs on your own computer.</p>
            <div className="hero-ctas">
              <a className="btn btn-primary" href={links.releases}>
                <IconDownload size={18} /> Download for macOS
              </a>
              <a className="btn btn-glass" href={links.repo}>
                <IconStar size={17} /> Star on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <a className="brand" href="#top">
                <img
                  src={`${import.meta.env.BASE_URL}icon-256.png`}
                  alt=""
                  width={28}
                  height={28}
                />
                Typelite
              </a>
              <p style={{ marginTop: 12, maxWidth: 320 }}>
                A free, open-source voice keyboard for macOS. Press a shortcut, speak, and clean
                text lands where you’re typing.
              </p>
            </div>
            <nav aria-labelledby="f-product">
              <h3 id="f-product">Product</h3>
              <ul>
                <li>
                  <a href="#faster">Faster than typing</a>
                </li>
                <li>
                  <a href="#features">Features</a>
                </li>
                <li>
                  <a href="#languages">Languages</a>
                </li>
                <li>
                  <a href="#setup">Setup</a>
                </li>
                <li>
                  <a href={links.releases}>Releases</a>
                </li>
              </ul>
            </nav>
            <nav aria-labelledby="f-docs">
              <h3 id="f-docs">Docs</h3>
              <ul>
                <li>
                  <a href={links.docs}>Guides</a>
                </li>
                <li>
                  <a href={links.models}>Choosing a model</a>
                </li>
                <li>
                  <a href={links.languages}>Languages</a>
                </li>
                <li>
                  <a href={links.presetCatalogue}>Preset catalogue</a>
                </li>
              </ul>
            </nav>
            <nav aria-labelledby="f-project">
              <h3 id="f-project">Project</h3>
              <ul>
                <li>
                  <a href={links.repo}>GitHub</a>
                </li>
                <li>
                  <a href={links.contributing}>Contributing</a>
                </li>
                <li>
                  <a href={links.issues}>Report a bug</a>
                </li>
                <li>
                  <a href={links.license}>MIT licence</a>
                </li>
              </ul>
            </nav>
          </div>
          <p className="footer-legal">
            © Typelite contributors. Released under the <a href={links.license}>MIT licence</a>;
            third-party components are listed in <a href={links.notices}>THIRD_PARTY_NOTICES</a>.
            Not affiliated with Typeless. This site uses no cookies, analytics or tracking.
          </p>
        </div>
      </footer>
    </>
  )
}
