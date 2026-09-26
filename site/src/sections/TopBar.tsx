import { useRef } from 'react'
import { IconMoon, IconStar, IconSun } from '../components/Icons'
import {
  formatCount,
  useActiveSection,
  useScrollProgress,
  useScrolled,
  useTheme,
  type RepoStats,
} from '../lib/hooks'
import { links } from '../links'

const NAV = [
  ['Why voice', '#faster'],
  ['Features', '#features'],
  ['Languages', '#languages'],
  ['Setup', '#setup'],
  ['Compare', '#compare'],
  ['Open source', '#open-source'],
] as const
const NAV_IDS = NAV.map(([, href]) => href.slice(1))

export function TopBar({ stats }: { stats: RepoStats | null }) {
  const scrolled = useScrolled()
  const [theme, toggleTheme] = useTheme()
  const bar = useRef<HTMLElement>(null)
  useScrollProgress(bar)
  const active = useActiveSection(NAV_IDS)
  return (
    <header className={`topbar ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="container topbar-inner">
        <a className="brand" href="#top" aria-label="Typelite, back to top">
          <img src={`${import.meta.env.BASE_URL}icon-256.png`} alt="" width={30} height={30} />
          Typelite
        </a>
        <nav className="topnav" aria-label="Sections">
          {NAV.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className={active === href.slice(1) ? 'is-active' : undefined}
              aria-current={active === href.slice(1) ? 'location' : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="topbar-actions">
          <a
            rel="noopener"
            className="btn btn-glass btn-sm btn-star"
            href={links.repo}
            aria-label={
              stats ? `Star Typelite on GitHub, ${stats.stars} stars` : 'Star Typelite on GitHub'
            }
          >
            <IconStar size={15} />
            <span>
              Star<span className="label-long"> on GitHub</span>
            </span>
            {stats && stats.stars > 0 && <span className="count">{formatCount(stats.stars)}</span>}
          </a>
          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
          >
            {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
          </button>
        </div>
      </div>
      <div className="scroll-progress" aria-hidden="true">
        <i ref={bar} />
      </div>
    </header>
  )
}
