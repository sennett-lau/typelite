import {
  BUILTIN_AI_PRESET_ID,
  BUILTIN_WHISPER_PRESET_ID,
  isBuiltinAi,
  isBuiltinSpeech,
  sameAiConnection,
  sameSpeechConnection,
  type AiPreset,
  type AppConfig,
  type SpeechPreset,
} from '../../stores/appStore'
import {
  cancelAiSetup,
  cancelSpeechSetup,
  deleteAiModel,
  deleteSpeechModel,
  startAiSetup,
  startSpeechSetup,
  testAiPreset,
  testSpeechPreset,
} from '../../lib/tauri'
import { recordAiResult, recordSpeechResult } from '../../lib/connectionStatus'
import { MODEL_SIZE_BYTES, type SetupTextNamespace } from '../../lib/speechSetup'
import {
  SPEECH_SERVICES_GUIDE_URL,
  isQwenCloudAddress,
  withServerKind,
} from '../../lib/speechTypes'
import type { ModelSetupStoreHook } from '../../stores/modelSetupStore'
import { useSpeechSetupStore } from '../../stores/speechSetupStore'
import { useAiSetupStore } from '../../stores/aiSetupStore'

/** A speech or an AI preset: the screens below handle both the same way. */
export type AnyPreset = SpeechPreset | AiPreset

/**
 * Plan `ai-polish-setup`: speech recognition and AI polish each run on one of two engines, Built-in
 * or "your server or API key", and their screens are built from the same pieces. A service holds
 * what differs: which presets it edits, how a preset is tested, the built-in setup's store and
 * commands, and its texts.
 */
export interface EngineService {
  id: 'speech' | 'ai'
  /** Texts of the built-in setup (`speechSetup.*` or `aiSetup.*`). */
  ns: SetupTextNamespace
  /** Texts of the engine choice and the server form (`speech.*` or `ai.*`, see `engineKey`). */
  textNs: 'speech' | 'ai'
  /** Keychain namespace of the API keys. */
  credential: 'stt' | 'llm'
  guideUrl: string
  placeholders: { address: string; model: string }
  /** AI presets have "Extra fields" (JSON) under a collapsed Advanced. */
  extraFields: boolean
  builtinId: string
  presetsOf: (config: AppConfig) => AnyPreset[]
  activeIdOf: (config: AppConfig) => string
  /** The config fields that hold `presets` and the active id. */
  choice: (presets: AnyPreset[], activeId: string) => Partial<AppConfig>
  isBuiltin: (preset: AnyPreset) => boolean
  newPreset: () => AnyPreset
  sameConnection: (a: AnyPreset, b: AnyPreset) => boolean
  /**
   * The preset as it is tested and saved. Speech sets the kind from the address (plan
   * `qwen-cloud-speech`); AI presets are unchanged.
   */
  resolve: (preset: AnyPreset) => AnyPreset
  /** The i18n key of a note shown under the fields for this address, if any. */
  addressNote: (baseUrl: string) => string | null
  test: (preset: AnyPreset, apiKey: string) => Promise<number>
  recordResult: (ok: boolean) => void
  store: ModelSetupStoreHook
  start: (modelId: string | null) => void
  cancel: () => Promise<boolean>
  deleteModel: (modelId: string) => Promise<void>
  /** The i18n key suffix of a model id (ids such as `qwen3-1.7b` hold a dot). */
  modelKey: (id: string) => string
  /** Sizes shown before the model list has loaded. */
  sizes: Record<string, number>
}

/** The AI polish guide on GitHub, opened by "Learn more" on the AI screens. */
export const AI_POLISH_GUIDE_URL =
  'https://github.com/sennett-lau/typelite/blob/main/docs/guides/ai-polish.md'

const AI_MODEL_KEYS: Record<string, string> = { 'qwen3-4b': 'best', 'qwen3-1.7b': 'faster' }

export const SPEECH_SERVICE: EngineService = {
  id: 'speech',
  ns: 'speechSetup',
  textNs: 'speech',
  credential: 'stt',
  guideUrl: SPEECH_SERVICES_GUIDE_URL,
  placeholders: { address: 'https://api.openai.com/v1', model: 'whisper-1' },
  extraFields: false,
  builtinId: BUILTIN_WHISPER_PRESET_ID,
  presetsOf: (config) => config.speech_presets,
  activeIdOf: (config) => config.active_speech_preset_id,
  choice: (presets, activeId) => ({
    speech_presets: presets as SpeechPreset[],
    active_speech_preset_id: activeId,
  }),
  isBuiltin: (preset) => isBuiltinSpeech(preset as SpeechPreset),
  newPreset: () => ({
    id: crypto.randomUUID(),
    name: '',
    kind: 'openai_compatible',
    base_url: '',
    model: '',
    model_file: '',
    language: 'auto',
    builtin: false,
    verified_at: null,
  }),
  sameConnection: (a, b) => sameSpeechConnection(a as SpeechPreset, b as SpeechPreset),
  resolve: (preset) => withServerKind(preset as SpeechPreset),
  addressNote: (baseUrl) => (isQwenCloudAddress(baseUrl) ? 'speech.qwenCloudNote' : null),
  test: (preset, apiKey) => testSpeechPreset(preset as SpeechPreset, apiKey),
  recordResult: (ok) => recordSpeechResult(ok),
  store: useSpeechSetupStore,
  start: (modelId) => {
    startSpeechSetup(modelId ?? undefined).catch((error) =>
      console.error('[speech setup] start failed', error),
    )
  },
  cancel: () => cancelSpeechSetup(),
  deleteModel: (modelId) => deleteSpeechModel(modelId),
  modelKey: (id) => id,
  sizes: MODEL_SIZE_BYTES,
}

export const AI_SERVICE: EngineService = {
  id: 'ai',
  ns: 'aiSetup',
  textNs: 'ai',
  credential: 'llm',
  guideUrl: AI_POLISH_GUIDE_URL,
  placeholders: { address: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  extraFields: true,
  builtinId: BUILTIN_AI_PRESET_ID,
  presetsOf: (config) => config.ai_presets,
  activeIdOf: (config) => config.active_ai_preset_id,
  choice: (presets, activeId) => ({
    ai_presets: presets as AiPreset[],
    active_ai_preset_id: activeId,
  }),
  isBuiltin: (preset) => isBuiltinAi(preset as AiPreset),
  newPreset: () => ({
    id: crypto.randomUUID(),
    name: '',
    kind: 'openai_compatible',
    base_url: '',
    model: '',
    model_file: '',
    extra_request_fields: {},
    builtin: false,
    verified_at: null,
  }),
  sameConnection: (a, b) => sameAiConnection(a as AiPreset, b as AiPreset),
  resolve: (preset) => preset,
  addressNote: () => null,
  test: (preset, apiKey) => testAiPreset(preset as AiPreset, apiKey),
  recordResult: (ok) => recordAiResult(ok),
  store: useAiSetupStore,
  start: (modelId) => {
    startAiSetup(modelId ?? undefined).catch((error) =>
      console.error('[AI setup] start failed', error),
    )
  },
  cancel: () => cancelAiSetup(),
  deleteModel: (modelId) => deleteAiModel(modelId),
  modelKey: (id) => AI_MODEL_KEYS[id] ?? id,
  sizes: { 'qwen3-4b': 2_497_281_120, 'qwen3-1.7b': 1_107_409_472 },
}

/** The Built-in preset of a service (every config has one). */
export function builtinPresetOf(service: EngineService, config: AppConfig) {
  const presets = service.presetsOf(config)
  return (
    presets.find((preset) => preset.id === service.builtinId) ??
    presets.find((preset) => service.isBuiltin(preset))
  )
}

/** The user's server and API key presets, in saved order. */
export function serverPresetsOf(service: EngineService, config: AppConfig): AnyPreset[] {
  return service.presetsOf(config).filter((preset) => !service.isBuiltin(preset))
}

/** The preset in use (the first one when the active id is missing). */
export function activePresetOf(service: EngineService, config: AppConfig): AnyPreset {
  const presets = service.presetsOf(config)
  const id = service.activeIdOf(config)
  return presets.find((preset) => preset.id === id) ?? presets[0]
}
