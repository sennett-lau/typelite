import { BUILTIN_WHISPER_PRESET_ID, isBuiltinSpeech, type SpeechPreset } from '../stores/appStore'

/**
 * Plan `two-tab-speech`: speech recognition runs on one of two engines, Built-in (whisper.cpp
 * inside Typelite) or "your server or API key" (any OpenAI-compatible speech service). The engine
 * in use follows from the active preset's kind.
 */
export type SpeechEngine = 'builtin' | 'server'

/** The speech services guide on GitHub, opened by "Learn more". */
export const SPEECH_SERVICES_GUIDE_URL =
  'https://github.com/sennett-lau/typelite/blob/main/docs/guides/speech-services.md'

/** Placeholders of the server form: the OpenAI example. */
export const SERVER_PLACEHOLDERS = {
  address: 'https://api.openai.com/v1',
  model: 'whisper-1',
} as const

export function engineOf(preset: Pick<SpeechPreset, 'kind'>): SpeechEngine {
  return isBuiltinSpeech(preset) ? 'builtin' : 'server'
}

/** The Built-in preset (every config has one; see the backend's `normalize_presets`). */
export function builtinWhisperPreset(presets: SpeechPreset[]): SpeechPreset | undefined {
  return (
    presets.find((preset) => preset.id === BUILTIN_WHISPER_PRESET_ID) ??
    presets.find((preset) => isBuiltinSpeech(preset))
  )
}

/** The user's server and API key presets, in saved order. */
export function serverPresets(presets: SpeechPreset[]): SpeechPreset[] {
  return presets.filter((preset) => !isBuiltinSpeech(preset))
}

function parse(baseUrl: string): URL | null {
  const trimmed = baseUrl.trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed)
  } catch {
    return null
  }
}

/** Host of an address, used as the preset name the form fills in: "api.openai.com". */
export function addressHostname(baseUrl: string): string {
  return parse(baseUrl)?.hostname ?? ''
}

/** Host with port for the saved presets list: "192.0.2.10:8000". */
export function addressHost(baseUrl: string): string {
  return parse(baseUrl)?.host ?? baseUrl.trim()
}

/** Formats a Test time: "850 ms" or "1.4 s". */
export function formatTestTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}
