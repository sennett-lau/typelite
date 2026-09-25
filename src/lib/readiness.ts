import {
  sameAiConnection,
  sameSpeechConnection,
  useAppStore,
  type AiPreset,
  type AppConfig,
  type SpeechPreset,
} from '../stores/appStore'
import { activeAiPreset, activeSpeechPreset } from './connectionStatus'

/**
 * Service readiness (plan `setup-without-dead-ends`). A service is ready when its active preset
 * passed a Test since the preset last changed; the result is stored per preset as `verified_at`.
 * The backend checks the same flags before Dictate, Translate and Ask start, so the two always
 * agree.
 */

export type ServiceKind = 'speech' | 'ai'

export function isSpeechReady(config: AppConfig): boolean {
  return Boolean(activeSpeechPreset(config).verified_at)
}

export function isAiReady(config: AppConfig): boolean {
  return Boolean(activeAiPreset(config).verified_at)
}

/** True when a base URL still holds a template placeholder such as `<computer-ip>`. */
export function hasPlaceholder(baseUrl: string): boolean {
  return /<[^>]*>/.test(baseUrl)
}

type PresetUpdate = (config: AppConfig) => Partial<AppConfig> | null

function applyToBoth(update: PresetUpdate) {
  useAppStore.setState((state) => {
    const config = update(state.config)
    const saved = state.savedConfig ? update(state.savedConfig) : null
    return {
      config: config ? { ...state.config, ...config } : state.config,
      savedConfig:
        state.savedConfig && saved ? { ...state.savedConfig, ...saved } : state.savedConfig,
    }
  })
}

/**
 * Sets `verified_at` on the preset with the given id, in both the edited and the saved config,
 * but only where that preset still has the given connection. With `tested` null the value is
 * set whatever the connection (used to clear it).
 */
function setVerifiedAt(
  kind: ServiceKind,
  presetId: string,
  verifiedAt: number | null,
  tested: SpeechPreset | AiPreset | null,
) {
  applyToBoth((config) => {
    if (kind === 'speech') {
      const index = config.speech_presets.findIndex((preset) => preset.id === presetId)
      const preset = config.speech_presets[index]
      if (!preset || preset.verified_at === verifiedAt) return null
      if (tested && !sameSpeechConnection(preset, tested as SpeechPreset)) return null
      const speech_presets = [...config.speech_presets]
      speech_presets[index] = { ...preset, verified_at: verifiedAt }
      return { speech_presets }
    }
    const index = config.ai_presets.findIndex((preset) => preset.id === presetId)
    const preset = config.ai_presets[index]
    if (!preset || preset.verified_at === verifiedAt) return null
    if (tested && !sameAiConnection(preset, tested as AiPreset)) return null
    const ai_presets = [...config.ai_presets]
    ai_presets[index] = { ...preset, verified_at: verifiedAt }
    return { ai_presets }
  })
}

/** Records a passed Test of `tested` (the preset as it was sent to the server). */
export function recordTestPassed(kind: ServiceKind, tested: SpeechPreset | AiPreset) {
  if (hasPlaceholder(tested.base_url)) return
  setVerifiedAt(kind, tested.id, Date.now(), tested)
}

/** Forgets a preset's passed Test, for example after its API key changed. */
export function clearTestResult(kind: ServiceKind, presetId: string) {
  setVerifiedAt(kind, presetId, null, null)
}

/** Payload of the backend's `preset:verification` event. */
export interface PresetVerificationEvent {
  kind: ServiceKind
  presetId: string
  verifiedAt: number | null
}

/**
 * Mirrors a Test result saved by the backend. A new result is only applied where the preset is
 * not being edited (its edited connection equals the saved one), so an unsaved change keeps
 * showing as not tested.
 */
export function applyVerificationEvent(event: PresetVerificationEvent) {
  if (event.verifiedAt === null) {
    clearTestResult(event.kind, event.presetId)
    return
  }
  const { savedConfig } = useAppStore.getState()
  const list: Array<SpeechPreset | AiPreset> | undefined =
    event.kind === 'speech' ? savedConfig?.speech_presets : savedConfig?.ai_presets
  const saved = list?.find((preset) => preset.id === event.presetId) ?? null
  setVerifiedAt(event.kind, event.presetId, event.verifiedAt, saved)
}
