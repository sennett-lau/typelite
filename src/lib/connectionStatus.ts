import {
  BUILTIN_AI_PRESET,
  BUILTIN_SPEECH_PRESET,
  findActivePreset,
  useAppStore,
  type AppConfig,
  type EndpointHealth,
} from '../stores/appStore'
import type { CapsuleErrorKey } from './capsuleError'

/**
 * Connection status for the sidebar: one dot for speech, one for AI. The dots only show the
 * last known result — from a Test button or from a real dictation — and the app never polls
 * the servers to find out.
 */

export type EndpointState = 'ok' | 'error' | 'unknown'

export function activeSpeechPreset(config: AppConfig) {
  const presets = config.speech_presets?.length ? config.speech_presets : [BUILTIN_SPEECH_PRESET]
  return findActivePreset(presets, config.active_speech_preset_id) ?? presets[0]
}

export function activeAiPreset(config: AppConfig) {
  const presets = config.ai_presets?.length ? config.ai_presets : [BUILTIN_AI_PRESET]
  return findActivePreset(presets, config.active_ai_preset_id) ?? presets[0]
}

/** A result only counts while the preset it was measured with is still the active one. */
export function endpointState(health: EndpointHealth | null, presetId: string): EndpointState {
  if (!health || health.presetId !== presetId) return 'unknown'
  return health.ok ? 'ok' : 'error'
}

/** Which endpoint a pipeline error points at, or null when it is not a server problem. */
export function endpointForError(key: CapsuleErrorKey): 'speech' | 'ai' | null {
  switch (key) {
    case 'stt_timeout':
    case 'stt_invalid_key':
    case 'stt_failed':
    case 'stt_quota_exceeded':
    case 'stt_not_configured':
    case 'stt_connection_failed':
      return 'speech'
    case 'llm_failed':
    case 'llm_quota_exceeded':
      return 'ai'
    default:
      return null
  }
}

/** Records a speech result for the preset that is active right now. */
export function recordSpeechResult(ok: boolean) {
  const { config, setSpeechHealth } = useAppStore.getState()
  setSpeechHealth({ presetId: activeSpeechPreset(config).id, ok })
}

/** Records an AI result for the preset that is active right now. */
export function recordAiResult(ok: boolean) {
  const { config, setAiHealth } = useAppStore.getState()
  setAiHealth({ presetId: activeAiPreset(config).id, ok })
}
