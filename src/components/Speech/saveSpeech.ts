import { useAppStore, type AppConfig, type SpeechPreset } from '../../stores/appStore'
import { setCredential, updateConfig as saveConfig } from '../../lib/tauri'

type SpeechChoice = Pick<AppConfig, 'speech_presets' | 'active_speech_preset_id'>

/**
 * Plan 0015: the speech engine, the preset in use and a saved preset are saved at once (not
 * through Settings' Save bar), both in onboarding and in Settings. Only the speech fields are
 * written; other unsaved Settings edits stay unsaved.
 */
export async function saveSpeechChoice(choice: SpeechChoice): Promise<void> {
  const { config, savedConfig, applyPersistedConfigPatch } = useAppStore.getState()
  await saveConfig({ ...(savedConfig ?? config), ...choice })
  applyPersistedConfigPatch(choice)
}

/** The speech presets as saved (edits waiting for Settings' Save bar are not included). */
function savedPresets(): SpeechPreset[] {
  const { config, savedConfig } = useAppStore.getState()
  return (savedConfig ?? config).speech_presets
}

/** Makes the preset with `id` the one in use. */
export async function selectSpeechPreset(id: string): Promise<void> {
  const { config } = useAppStore.getState()
  if (config.active_speech_preset_id === id) return
  await saveSpeechChoice({ speech_presets: savedPresets(), active_speech_preset_id: id })
}

/**
 * Adds or updates a server preset and makes it the one in use. The API key goes to the
 * Keychain first (the backend clears a passed Test when the key changes), then the config.
 */
export async function saveServerPreset(
  preset: SpeechPreset,
  apiKey: { value: string; changed: boolean },
): Promise<void> {
  if (apiKey.changed) await setCredential('stt', preset.id, apiKey.value)
  const presets = savedPresets()
  const exists = presets.some((existing) => existing.id === preset.id)
  const speech_presets = exists
    ? presets.map((existing) => (existing.id === preset.id ? preset : existing))
    : [...presets, preset]
  await saveSpeechChoice({ speech_presets, active_speech_preset_id: preset.id })
}

/** Removes a server preset and its key. The engine in use falls back to `fallbackId`. */
export async function deleteServerPreset(id: string, fallbackId: string): Promise<void> {
  const { config } = useAppStore.getState()
  const speech_presets = savedPresets().filter((preset) => preset.id !== id)
  const active_speech_preset_id =
    config.active_speech_preset_id === id ? fallbackId : config.active_speech_preset_id
  await saveSpeechChoice({ speech_presets, active_speech_preset_id })
  await setCredential('stt', id, '').catch((error) =>
    console.error('[speech] failed to remove the API key of a deleted preset', error),
  )
}
