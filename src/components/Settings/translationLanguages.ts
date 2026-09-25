import { getTranslationLanguageDefaults, updateConfig as saveConfig } from '../../lib/tauri'
import { useAppStore, type TranslationLanguageSettings } from '../../stores/appStore'

// Plan `translation-language-presets`: loading the built-in instructions and saving one
// language's settings, for `TranslationLanguageSheet`.

let defaultsRequest: Promise<Record<string, string>> | null = null

/** The built-in instructions of every language, loaded once from the backend. */
export function loadTranslationDefaults(): Promise<Record<string, string>> {
  if (!defaultsRequest) {
    defaultsRequest = Promise.resolve(getTranslationLanguageDefaults())
      .then((defaults) => defaults ?? {})
      .catch((error) => {
        defaultsRequest = null
        throw error
      })
  }
  return defaultsRequest
}

/** Forgets the loaded defaults (tests). */
export function resetTranslationDefaultsCache() {
  defaultsRequest = null
}

/**
 * Saves one language's settings at once (like the preset sheets), writing only
 * `translation.languages`, so other unsaved Settings edits stay unsaved.
 */
export async function saveTranslationLanguage(
  code: string,
  settings: TranslationLanguageSettings,
): Promise<void> {
  const { config, savedConfig, applyPersistedTranslationLanguages } = useAppStore.getState()
  const base = savedConfig ?? config
  const languages = { ...(base.translation.languages ?? {}) }
  if (settings.ai_preset_id === null && settings.instructions === null) delete languages[code]
  else languages[code] = settings
  await saveConfig({ ...base, translation: { ...base.translation, languages } })
  applyPersistedTranslationLanguages(languages)
}
