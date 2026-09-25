import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { activeSpeechPreset } from '../../lib/connectionStatus'
import {
  builtinWhisperPreset,
  engineOf,
  serverPresets,
  type SpeechEngine,
} from '../../lib/speechTypes'
import { useAppStore } from '../../stores/appStore'
import { selectSpeechPreset } from './saveSpeech'
import { BuiltinSettings } from './BuiltinSettings'
import { ServerSettings } from './ServerSettings'

const ENGINES: SpeechEngine[] = ['builtin', 'server']

/**
 * Settings → Speech (plan `two-tab-speech`): "Speech recognition uses" is a choice between two
 * option cards, Built-in and "Your server or API key". Picking one makes it the engine in use
 * (saved at once) and shows its details below. With no saved server preset there is nothing to
 * switch to yet, so that card only opens the empty form; saving it makes the new preset the one in
 * use.
 */
export function SpeechEngineChoice() {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const activeId = config.active_speech_preset_id
  const activeEngine = engineOf(activeSpeechPreset(config))
  const [shown, setShown] = useState<{ engine: SpeechEngine; activeId: string }>({
    engine: activeEngine,
    activeId,
  })
  const [error, setError] = useState<string | null>(null)
  if (shown.activeId !== activeId) {
    // The preset in use changed (here, by a finished download, or in another window).
    setShown({ engine: activeEngine, activeId })
  }
  const engine = shown.activeId === activeId ? shown.engine : activeEngine

  const choose = (next: SpeechEngine) => {
    setError(null)
    setShown({ engine: next, activeId })
    if (next === activeEngine) return
    const target =
      next === 'builtin'
        ? builtinWhisperPreset(config.speech_presets)
        : serverPresets(config.speech_presets)[0]
    if (target) {
      selectSpeechPreset(target.id).catch((err) => setError(String(err)))
    }
  }

  return (
    <div>
      <div className="group-label">{t('speech.engineLabel')}</div>
      <div role="radiogroup" aria-label={t('speech.engineLabel')} className="option-cards">
        {ENGINES.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={engine === value}
            onClick={() => choose(value)}
            className="option-card"
          >
            <span className="option-card-title">{t(`speech.engines.${value}.title`)}</span>
            <span className="option-card-detail">{t(`speech.engines.${value}.detail`)}</span>
          </button>
        ))}
      </div>
      {error && <p className="m-0 mt-2 text-[12px] text-error">{error}</p>}
      {engine === 'builtin' ? <BuiltinSettings /> : <ServerSettings />}
    </div>
  )
}
