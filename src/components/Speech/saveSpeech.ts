import { useAppStore, type AppConfig } from '../../stores/appStore'
import { setCredential, updateConfig as saveConfig } from '../../lib/tauri'
import { SPEECH_SERVICE, type AnyPreset, type EngineService } from './services'

/**
 * Plan `two-tab-speech` (speech) and `ai-polish-setup` (AI): the engine, the preset in use and a
 * saved preset are saved at once (not through Settings' Save bar), both in onboarding and in
 * Settings. Only the fields of that service are written; other unsaved Settings edits stay unsaved.
 */
export async function saveChoice(choice: Partial<AppConfig>): Promise<void> {
  const { config, savedConfig, applyPersistedConfigPatch } = useAppStore.getState()
  await saveConfig({ ...(savedConfig ?? config), ...choice })
  applyPersistedConfigPatch(choice)
}

/** The service's presets as saved (edits waiting for Settings' Save bar are not included). */
export function savedPresetsOf(service: EngineService): AnyPreset[] {
  const { config, savedConfig } = useAppStore.getState()
  return service.presetsOf(savedConfig ?? config)
}

/** Makes the preset with `id` the one in use. */
export async function selectPreset(service: EngineService, id: string): Promise<void> {
  const { config } = useAppStore.getState()
  if (service.activeIdOf(config) === id) return
  await saveChoice(service.choice(savedPresetsOf(service), id))
}

/**
 * Adds or updates a server preset and makes it the one in use. The API key goes to the
 * Keychain first (the backend clears a passed Test when the key changes), then the config.
 */
export async function saveServerPreset(
  service: EngineService,
  preset: AnyPreset,
  apiKey: { value: string; changed: boolean },
): Promise<void> {
  if (apiKey.changed) await setCredential(service.credential, preset.id, apiKey.value)
  const presets = savedPresetsOf(service)
  const exists = presets.some((existing) => existing.id === preset.id)
  const next = exists
    ? presets.map((existing) => (existing.id === preset.id ? preset : existing))
    : [...presets, preset]
  await saveChoice(service.choice(next, preset.id))
}

/** Removes a server preset and its key. The engine in use falls back to `fallbackId`. */
export async function deleteServerPreset(
  service: EngineService,
  id: string,
  fallbackId: string,
): Promise<void> {
  const { config } = useAppStore.getState()
  const next = savedPresetsOf(service).filter((preset) => preset.id !== id)
  const activeId = service.activeIdOf(config) === id ? fallbackId : service.activeIdOf(config)
  await saveChoice(service.choice(next, activeId))
  await setCredential(service.credential, id, '').catch((error) =>
    console.error(`[${service.id}] failed to remove the API key of a deleted preset`, error),
  )
}

/** Speech shorthands (plan `two-tab-speech`). */
export function saveSpeechChoice(
  choice: Pick<AppConfig, 'speech_presets' | 'active_speech_preset_id'>,
): Promise<void> {
  return saveChoice(choice)
}

export function selectSpeechPreset(id: string): Promise<void> {
  return selectPreset(SPEECH_SERVICE, id)
}
