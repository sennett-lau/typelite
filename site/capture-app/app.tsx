// Mounts the real app (src/App.tsx) into the capture frame, after main.ts installed the mocks.
import { createRoot } from 'react-dom/client'
import '../../src/i18n'
import './app.css'
import './capture.css'
import App from '../../src/App'
import { SHORTCUT_TOUR_FIRST_STEP, useAppStore } from '../../src/stores/appStore'
import { SHORTCUT_PAGES } from '../../src/components/Onboarding/shortcutConfig'
import { setBaseConfig, type Screen } from './mocks'

declare global {
  interface Window {
    /** Set once the screen has rendered and settled; the capture script waits for it. */
    __captureReady?: boolean
  }
}

const COPY_TEXT =
  'Thanks for the update! Let’s meet on Thursday at 4 pm to go through the launch checklist.'

export function mount(screen: Screen) {
  const defaults = useAppStore.getState().config
  setBaseConfig(defaults)
  // Both services passed a check (green dots in the sidebar).
  useAppStore.setState({
    speechHealth: { presetId: defaults.speech_presets[0].id, ok: true },
    aiHealth: { presetId: defaults.ai_presets[0].id, ok: true },
  })

  if (screen === 'onboarding') {
    // The Translate setup page: key caps, the language list and the pill preview.
    const index = SHORTCUT_PAGES.findIndex((p) => p.role === 'translate' && p.kind === 'setup')
    useAppStore.setState({ onboardingStep: SHORTCUT_TOUR_FIRST_STEP + index })
  }

  const target = document.getElementById('app') as HTMLElement
  createRoot(target).render(<App />)

  if (screen === 'copy-pill') {
    // The Copy pill appears when a result had nowhere to be pasted.
    setTimeout(
      () => useAppStore.getState().setCopyOffer({ text: COPY_TEXT, targetLang: null }),
      1500,
    )
  }

  // Give data loads, fonts and entry animations time to finish.
  setTimeout(() => {
    window.__captureReady = true
  }, 1800)
}
