import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { noModelSuits } from '../../lib/speechSetup'
import { useAppStore } from '../../stores/appStore'
import { useSetupHardware } from '../../hooks/useSpeechSetup'
import { selectPreset } from './saveSpeech'
import { BuiltinSettings } from './BuiltinSettings'
import { LearnMoreLink } from './LearnMoreLink'
import { ServerSettings } from './ServerSettings'
import {
  SPEECH_SERVICE,
  activePresetOf,
  builtinPresetOf,
  serverPresetsOf,
  type EngineService,
} from './services'

type Engine = 'builtin' | 'server'
const ENGINES: Engine[] = ['builtin', 'server']

/**
 * Settings → Speech and → AI (plans 0015 and 0017): "Speech recognition uses" / "AI polish
 * uses" is a choice between two option cards, Built-in and "Your server or API key", with
 * "Learn more" at the right of the header. Picking one makes it the engine in use (saved at
 * once) and shows its details below. With no saved server preset there is nothing to switch to
 * yet, so that card only opens the empty form; saving it makes the new preset the one in use.
 * When no built-in model suits this Mac, the Built-in card is dimmed, reads "Not available on
 * this Mac", cannot be picked, and the page shows the server option.
 */
export function EngineChoice({ service }: { service: EngineService }) {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const hardware = useSetupHardware(service.store)
  const active = activePresetOf(service, config)
  const activeId = active?.id ?? ''
  const builtinUnavailable = noModelSuits(hardware)
  const activeEngine: Engine =
    active && service.isBuiltin(active) && !builtinUnavailable ? 'builtin' : 'server'
  const [shown, setShown] = useState<{ engine: Engine; activeId: string }>({
    engine: activeEngine,
    activeId,
  })
  const [error, setError] = useState<string | null>(null)
  if (shown.activeId !== activeId) {
    // The preset in use changed (here, by a finished download, or in another window).
    setShown({ engine: activeEngine, activeId })
  }
  const picked = shown.activeId === activeId ? shown.engine : activeEngine
  const engine: Engine = builtinUnavailable ? 'server' : picked

  const choose = (next: Engine) => {
    setError(null)
    setShown({ engine: next, activeId })
    if (next === activeEngine) return
    const target =
      next === 'builtin' ? builtinPresetOf(service, config) : serverPresetsOf(service, config)[0]
    if (target) {
      selectPreset(service, target.id).catch((err) => setError(String(err)))
    }
  }

  const label = t(`${service.textNs}.engineLabel`)
  return (
    <div>
      <div className="mx-1 mb-[7px] flex flex-wrap items-end justify-between gap-2.5">
        <span className="group-label m-0">{label}</span>
        <LearnMoreLink url={service.guideUrl} />
      </div>
      <div role="radiogroup" aria-label={label} className="option-cards">
        {ENGINES.map((value) => {
          const unavailable = value === 'builtin' && builtinUnavailable
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={engine === value}
              disabled={unavailable}
              onClick={() => choose(value)}
              className="option-card"
            >
              <span className="option-card-title">
                {t(`${service.textNs}.engines.${value}.title`)}
              </span>
              <span className="option-card-detail">
                {unavailable
                  ? t('speech.notAvailable')
                  : t(`${service.textNs}.engines.${value}.detail`)}
              </span>
            </button>
          )
        })}
      </div>
      {error && <p className="m-0 mt-2 text-[12px] text-error">{error}</p>}
      {engine === 'builtin' ? (
        <BuiltinSettings service={service} />
      ) : (
        <ServerSettings service={service} />
      )}
    </div>
  )
}

/** Settings → Speech's engine choice (plan 0015). */
export function SpeechEngineChoice() {
  return <EngineChoice service={SPEECH_SERVICE} />
}
