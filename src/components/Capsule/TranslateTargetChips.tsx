import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MAX_TRANSLATION_TARGETS,
  TARGET_LANGUAGE_SHORT_LABELS,
  targetLanguageLabel,
} from '../../lib/constants'
import { setActiveTranslationTarget } from '../../lib/tauri'
import { useAppStore } from '../../stores/appStore'

function shortLanguageLabel(code: string) {
  return TARGET_LANGUAGE_SHORT_LABELS[code] ?? code.slice(0, 2).toUpperCase()
}

/**
 * The languages of a Translate recording: one chip per chosen language (the active chip uses
 * the pill accent, system blue or the Aurora teal in dark mode), or just the language name
 * when only one is chosen. Clicking a chip switches the language of the running recording
 * without stopping it; the Switch language shortcut does the same.
 */
export function TranslateTargetChips() {
  const { t } = useTranslation()
  const pipelineState = useAppStore((state) => state.pipelineState)
  const activeVoiceMode = useAppStore((state) => state.activeVoiceMode)
  const targets = useAppStore((state) => state.config.translation.targets)
  const activeTarget = useAppStore((state) => state.config.translation.active_target)
  const applyPersistedConfigPatch = useAppStore((state) => state.applyPersistedConfigPatch)
  const [pending, setPending] = useState(false)

  if (pipelineState !== 'recording' || activeVoiceMode !== 'translate') return null

  const languageName = (code: string) => targetLanguageLabel(code, t)

  if (targets.length <= 1) {
    const code = targets[0] ?? activeTarget
    return (
      <span
        title={languageName(code)}
        aria-label={`${t('translate.chipLabel')} ${languageName(code)}`}
        className="min-w-0 max-w-[72px] flex-shrink truncate whitespace-nowrap text-[11px] font-medium text-white/85"
      >
        {languageName(code)}
      </span>
    )
  }

  const selectTarget = async (code: string) => {
    if (code === activeTarget || pending) return
    setPending(true)
    try {
      const translation = await setActiveTranslationTarget(code)
      applyPersistedConfigPatch({ target_lang: translation.active_target, translation })
    } catch (error) {
      console.error('Failed to switch translation target:', error)
    } finally {
      setPending(false)
    }
  }

  // Clicks on a chip must not reach the pill, where a click stops the recording.
  const stopPointerPropagation = (event: React.PointerEvent) => event.stopPropagation()

  return (
    <div
      role="group"
      aria-label={t('translate.chipsLabel')}
      className="flex flex-shrink-0 items-center gap-[3px]"
    >
      {targets.slice(0, MAX_TRANSLATION_TARGETS).map((code) => {
        const active = code === activeTarget
        return (
          <button
            key={code}
            type="button"
            aria-pressed={active}
            aria-label={`${t('translate.chipLabel')} ${languageName(code)}`}
            title={languageName(code)}
            disabled={pending}
            onPointerDown={stopPointerPropagation}
            onPointerUp={stopPointerPropagation}
            onClick={(event) => {
              event.stopPropagation()
              void selectTarget(code)
            }}
            className={`flex h-[18px] min-w-[22px] max-w-[28px] flex-shrink-0 items-center justify-center overflow-hidden whitespace-nowrap rounded-full border px-1 text-[11px] font-semibold leading-none transition-colors ${
              active
                ? 'border-pill-chip bg-pill-chip text-pill-chip-text'
                : 'border-white/30 bg-transparent text-white/80 hover:border-white/50 hover:text-white'
            }`}
          >
            {shortLanguageLabel(code)}
          </button>
        )
      })}
    </div>
  )
}
