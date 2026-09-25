import {
  BUILTIN_SPEECH_PRESETS,
  BUILTIN_WHISPER_PRESET_ID,
  isBuiltinSpeech,
  type SpeechPreset,
} from '../stores/appStore'

/**
 * Plan 0014: the speech screens start with a type, and only that type's fields show.
 * Presets carry no type of their own (except built-in ones); it follows from the address, so
 * configs from before the plan keep working.
 */
export type SpeechType = 'builtin' | 'local' | 'openai'

/** Services inside "OpenAI-compatible". */
export type SpeechService = 'openai' | 'groq' | 'custom'

export const SPEECH_TYPES: readonly SpeechType[] = ['builtin', 'local', 'openai']
export const SPEECH_SERVICES: readonly SpeechService[] = ['openai', 'groq', 'custom']

/** The template each type (and service) selects. */
export const LOCAL_TEMPLATE_ID = 'builtin-speech-local'
export const SERVICE_TEMPLATE_ID: Record<Exclude<SpeechService, 'custom'>, string> = {
  openai: 'builtin-speech-openai',
  groq: 'builtin-speech-groq',
}

const SERVICE_HOSTS: Record<Exclude<SpeechService, 'custom'>, string> = {
  openai: 'api.openai.com',
  groq: 'api.groq.com',
}

function hostOf(baseUrl: string): string | null {
  const trimmed = baseUrl.trim()
  if (!trimmed) return null
  // A template placeholder such as <computer-ip> is not a valid URL; treat it as a host.
  const withoutPlaceholder = trimmed.replace(/<[^>]*>/g, 'placeholder')
  try {
    return new URL(withoutPlaceholder).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** True for addresses on this Mac or the local network (including Tailscale's 100.64/10). */
export function isLocalAddress(baseUrl: string): boolean {
  if (/<[^>]*>/.test(baseUrl)) return true
  const host = hostOf(baseUrl)
  if (host === null) return false
  if (host === 'localhost' || host === 'placeholder' || host === '[::1]' || host === '::1') {
    return true
  }
  if (host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.internal')) return true
  if (!host.includes('.')) return true // a bare machine name
  const parts = host.split('.').map(Number)
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0)) {
    const [a, b] = parts
    if (
      a === 127 ||
      a === 10 ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return true
    }
  }
  if (host.endsWith('.ts.net')) return true
  // Plain http to a named host is almost always a server on the network, not a cloud API.
  return baseUrl.trim().toLowerCase().startsWith('http://')
}

export function speechTypeOf(preset: SpeechPreset): SpeechType {
  if (isBuiltinSpeech(preset)) return 'builtin'
  return isLocalAddress(preset.base_url) ? 'local' : 'openai'
}

export function speechServiceOf(preset: SpeechPreset): SpeechService {
  const host = hostOf(preset.base_url)
  if (host === SERVICE_HOSTS.openai) return 'openai'
  if (host === SERVICE_HOSTS.groq) return 'groq'
  return 'custom'
}

/** The shipped template with this id (fresh copy), if there is one. */
export function speechTemplate(id: string): SpeechPreset | undefined {
  const template = BUILTIN_SPEECH_PRESETS.find((preset) => preset.id === id)
  return template ? { ...template } : undefined
}

/** The installed "Built-in (this Mac)" preset, if Quick setup created one. */
export function builtinWhisperPreset(presets: SpeechPreset[]): SpeechPreset | undefined {
  return (
    presets.find((preset) => preset.id === BUILTIN_WHISPER_PRESET_ID) ??
    presets.find((preset) => isBuiltinSpeech(preset))
  )
}

/**
 * The preset list with the template `id` present (templates deleted in older versions come
 * back when the user picks their type).
 */
export function withTemplate(presets: SpeechPreset[], id: string): SpeechPreset[] {
  if (presets.some((preset) => preset.id === id)) return presets
  const template = speechTemplate(id)
  return template ? [...presets, template] : presets
}

/** Host part of an address for a suggested preset name, e.g. "192.0.2.10". */
export function addressLabel(baseUrl: string): string {
  return hostOf(baseUrl) ?? baseUrl.trim()
}

/** Formats a Test time: "850 ms" or "1.4 s". */
export function formatTestTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}
