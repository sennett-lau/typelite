import i18next, { type PostProcessorModule } from 'i18next'

/**
 * Plan `si-mode`: a joke switch (Settings → System → "Say SI instead of AI") that shows every
 * "AI" in the interface as "SI" and "artificial intelligence" as "super intelligence". It is an
 * i18next post-processor, so it covers every translated string, including values interpolated
 * into them, in every window. Only the interface changes: prompts, logs and pasted text do not.
 */
const REPLACEMENTS: [RegExp, string][] = [
  // Whole word only, so "OpenAI" and "AIFF" stay as they are.
  [/\bAI\b/g, 'SI'],
  [/\bArtificial Intelligence\b/g, 'Super Intelligence'],
  [/\bArtificial intelligence\b/g, 'Super intelligence'],
  [/\bartificial intelligence\b/g, 'super intelligence'],
  [/人工智能/g, '超级智能'],
  // Plan `ui-languages`: the other interface languages. Spanish and French write AI as "IA",
  // German as "KI".
  [/人工智慧/g, '超級智慧'],
  [/人工知能/g, '超知能'],
  [/\b(IA|KI)\b/g, 'SI'],
  [/inteligencia artificial/gi, 'superinteligencia'],
  [/intelligence artificielle/gi, 'superintelligence'],
  [/künstliche Intelligenz/gi, 'Superintelligenz'],
]

export function toSuperIntelligence(text: string): string {
  return REPLACEMENTS.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    text,
  )
}

// Remembered per window so the first paint already uses it; the config (`si_mode`) is the truth.
const STORAGE_KEY = 'si_mode'
let enabled = readStored()

function readStored(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export const siModePostProcessor: PostProcessorModule = {
  type: 'postProcessor',
  name: 'siMode',
  process: (value: string) =>
    enabled && typeof value === 'string' ? toSuperIntelligence(value) : value,
}

export function isSiModeEnabled(): boolean {
  return enabled
}

/** Turns the switch on or off and re-renders translated text (react-i18next re-renders on
 * `languageChanged`, so the current language is set again). */
export function setSiMode(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(on))
  } catch {
    // Storage can be blocked; the config still carries the setting.
  }
  if (enabled === on) return
  enabled = on
  // The app's instance is i18next's default one (`src/i18n/index.ts`).
  i18next.changeLanguage(i18next.language)
}
