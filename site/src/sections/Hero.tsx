import type { CSSProperties } from 'react'
import { HeroDemo } from '../demos/HeroDemo'
import { HeroBackdrop } from '../components/HeroBackdrop'
import { IconBook, IconDownload, IconStar } from '../components/Icons'
import { formatCount, type RepoStats } from '../lib/hooks'
import { links } from '../links'

export function Hero({ stats }: { stats: RepoStats | null }) {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <HeroBackdrop />
      <div className="container">
        <span className="hero-badge hero-rise">
          <b>MIT</b> Free and open source · macOS
        </span>
        {/* Each word blurs into focus in turn (CSS only, so the pre-rendered page animates too);
            the text content is still "Just say it." for search engines and screen readers. */}
        <h1 id="hero-title" className="hero-title">
          <span className="hw" style={word(0)}>
            Just
          </span>{' '}
          <span className="hw" style={word(1)}>
            <span className="gradient-text gradient-live">say</span>
          </span>{' '}
          <span className="hw" style={word(2)}>
            <span className="gradient-text gradient-live gradient-live-2">it.</span>
          </span>
        </h1>
        <p className="hero-sub hero-rise" style={rise(0.45)}>
          Press a shortcut in any app, speak, and clean text lands where you’re typing. Free, open
          source, runs on your computer.
        </p>
        <div className="hero-ctas hero-rise" style={rise(0.55)}>
          <a rel="noopener" className="btn btn-primary" href={links.releases}>
            <IconDownload size={18} />
            Download for macOS
          </a>
          <a rel="noopener" className="btn btn-glass btn-star" href={links.repo}>
            <IconStar size={17} />
            Star on GitHub
            {stats && stats.stars > 0 && <span className="count">{formatCount(stats.stars)}</span>}
          </a>
          <a rel="noopener" className="btn btn-glass" href={links.docs}>
            <IconBook size={17} />
            Read the docs
          </a>
        </div>
        <p className="hero-note hero-rise" style={rise(0.65)}>
          Apple Silicon recommended · No account · No telemetry ·{' '}
          <a href="#install">or build from source</a>
        </p>
        <div className="hero-demo hero-rise" style={rise(0.75)}>
          <HeroDemo />
        </div>
      </div>
    </section>
  )
}

const word = (i: number) => ({ '--i': i }) as CSSProperties
const rise = (delay: number) => ({ '--d': `${delay}s` }) as CSSProperties
