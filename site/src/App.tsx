import { useRepoStats, useScrollReveal } from './lib/hooks'
import { TopBar } from './sections/TopBar'
import { Hero } from './sections/Hero'
import { Features } from './sections/Features'
import { Languages } from './sections/Languages'
import { Setup } from './sections/Setup'
import { Benchmarks } from './sections/Benchmarks'
import { Compare, Footer, OpenSource, Privacy } from './sections/More'

export function App() {
  const stats = useRepoStats()
  useScrollReveal()
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopBar stats={stats} />
      <main id="main">
        <Hero stats={stats} />
        <Features />
        <Languages />
        <Setup />
        <Benchmarks />
        <Compare />
        <OpenSource stats={stats} />
        <Privacy />
      </main>
      <Footer />
    </>
  )
}
