/**
 * Capture page for scripts/capture-media.mjs: renders one demo at a fixed size, with its
 * clock driven frame by frame (`window.__typeliteCapture.setTime`). Not part of the site build.
 *
 *   /typelite/capture/?scene=hero|translate|ask|og&theme=light|dark
 */
import { createRoot } from 'react-dom/client'
import { enableCaptureClock } from '../src/lib/clock'
import { HeroDemo } from '../src/demos/HeroDemo'
import { AskVignette, TranslateVignette } from '../src/demos/Vignettes'
import { Aurora, Pill, PillRecording, speechBetween } from '../src/components/Pill'
import '../src/styles.css'
import './capture.css'

const params = new URLSearchParams(location.search)
const scene = params.get('scene') ?? 'hero'
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light'
enableCaptureClock()

function Og() {
  const speaking = speechBetween(0, 100)
  return (
    <div className="og">
      <div className="og-brand">
        <img src={`${import.meta.env.BASE_URL}icon-256.png`} alt="" width={64} height={64} />
        Typelite
      </div>
      <h1>
        Just <span className="gradient-text">say it.</span>
      </h1>
      <p>Press a shortcut in any app, speak, and clean text lands where you’re typing.</p>
      <div className="og-pill">
        <Pill width={160}>
          <Aurora mode="listening" t={3.2} level={0.7} />
          <PillRecording t={3.2} speaking={speaking} seed={2} />
        </Pill>
      </div>
      <div className="og-foot">Free · Open source (MIT) · Runs on your computer · macOS</div>
    </div>
  )
}

const scenes: Record<string, () => React.ReactElement> = {
  hero: () => (
    <div className="cap-hero">
      <HeroDemo />
    </div>
  ),
  translate: () => (
    <div className="cap-vignette">
      <TranslateVignette />
    </div>
  ),
  ask: () => (
    <div className="cap-vignette">
      <AskVignette />
    </div>
  ),
  og: Og,
}

const Scene = scenes[scene] ?? scenes.hero
createRoot(document.getElementById('frame')!).render(<Scene />)
