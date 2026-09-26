import { HeroDemo } from '../demos/HeroDemo'
import { IconBook, IconDownload, IconStar } from '../components/Icons'
import { formatCount, type RepoStats } from '../lib/hooks'
import { links } from '../links'

export function Hero({ stats }: { stats: RepoStats | null }) {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="container">
        <span className="hero-badge">
          <b>MIT</b> Free and open source · macOS
        </span>
        <h1 id="hero-title">
          Just <span className="gradient-text">say it.</span>
        </h1>
        <p className="hero-sub">
          Press a shortcut in any app, speak, and clean text lands where you’re typing. Free, open
          source, runs on your computer.
        </p>
        <div className="hero-ctas">
          <a rel="noopener" className="btn btn-primary" href={links.releases}>
            <IconDownload size={18} />
            Download for macOS
          </a>
          <a rel="noopener" className="btn btn-glass" href={links.repo}>
            <IconStar size={17} />
            Star on GitHub
            {stats && stats.stars > 0 && <span className="count">{formatCount(stats.stars)}</span>}
          </a>
          <a rel="noopener" className="btn btn-glass" href={links.docs}>
            <IconBook size={17} />
            Read the docs
          </a>
        </div>
        <p className="hero-note">
          Apple Silicon recommended · No account · No telemetry ·{' '}
          <a href="#install">or build from source</a>
        </p>
        <div className="hero-demo">
          <HeroDemo />
        </div>
      </div>
    </section>
  )
}
