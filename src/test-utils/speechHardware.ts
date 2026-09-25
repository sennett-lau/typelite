import type { SpeechHardwareCheck } from '../lib/tauri'
import type { SpeechPreset } from '../stores/appStore'

const SIZES: Record<string, number> = { 'large-v3-turbo': 574_041_195, small: 190_085_487 }

/** A hardware check result offering `models` (plan 0015), as the backend would send it. */
export function hardwareCheck(
  models: string[],
  options: Partial<SpeechHardwareCheck['hardware']> & {
    leftOut?: SpeechHardwareCheck['offer']['leftOut']
    neededBytes?: number | null
  } = {},
): SpeechHardwareCheck {
  const { leftOut = null, neededBytes = null, ...hardware } = options
  return {
    hardware: {
      chipKind: 'apple_silicon',
      chipName: 'Apple M1 Pro',
      memoryBytes: 32 * 1024 ** 3,
      freeBytes: 50_000_000_000,
      ...hardware,
    },
    offer: {
      models: models.map((id, index) => ({
        id,
        sizeBytes: SIZES[id] ?? 1,
        recommended: index === 0 && models.length > 1,
      })),
      leftOut,
      neededBytes,
    },
  }
}

/** A saved server or API key preset. */
export function serverPreset(
  id: string,
  name: string,
  base_url: string,
  model = 'm',
): SpeechPreset {
  return {
    id,
    name,
    kind: 'openai_compatible',
    base_url,
    model,
    model_file: '',
    language: 'auto',
    builtin: false,
    verified_at: null,
  }
}

/** The Built-in preset with an installed model. */
export function installedBuiltin(
  model = 'large-v3-turbo',
  verified_at: number | null = 5,
): SpeechPreset {
  return {
    id: 'builtin-speech-this-mac',
    name: 'Built-in (this Mac)',
    kind: 'builtin',
    base_url: '',
    model,
    model_file: model === 'small' ? 'ggml-small-q5_1.bin' : 'ggml-large-v3-turbo-q5_0.bin',
    language: 'auto',
    builtin: true,
    verified_at,
  }
}
