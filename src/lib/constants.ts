// App metadata
export const UI_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
] as const

export const APP_NAME = 'Typelite'
export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? 'v0.1.0'
export const APP_REPO_URL = 'https://github.com/sennett-lau/typelite'
export const APP_LICENSE_URL = 'https://github.com/sennett-lau/typelite/blob/main/LICENSE'

export const LANGUAGES: { value: string; label?: string; labelKey?: string }[] = [
  { value: 'auto', labelKey: 'settings.autoDetect' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
  { value: 'ru', label: 'Русский' },
  { value: 'ar', label: 'العربية' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'th', label: 'ไทย' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'it', label: 'Italiano' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'pl', label: 'Polski' },
  { value: 'uk', label: 'Українська' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'ms', label: 'Bahasa Melayu' },
]

/**
 * Translation target languages, in the order the Settings list offers them. Chinese has three
 * variants: Simplified, Traditional as written in Hong Kong, and Traditional as written in
 * Taiwan. Keep in sync with `SUPPORTED_TRANSLATION_LANGUAGES` in src-tauri/src/storage/mod.rs.
 * `labelKey` entries are translated with the UI language; the others show their own name.
 */
export const TARGET_LANGUAGES: { value: string; label: string; labelKey?: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh-Hans', label: 'Chinese (Simplified)', labelKey: 'translate.languages.zhHans' },
  {
    value: 'zh-Hant-HK',
    label: 'Chinese (Traditional, Hong Kong)',
    labelKey: 'translate.languages.zhHantHK',
  },
  {
    value: 'zh-Hant-TW',
    label: 'Chinese (Traditional, Taiwan)',
    labelKey: 'translate.languages.zhHantTW',
  },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
  { value: 'ru', label: 'Русский' },
  { value: 'ar', label: 'العربية' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'th', label: 'ไทย' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'it', label: 'Italiano' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'pl', label: 'Polski' },
  { value: 'uk', label: 'Українська' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'ms', label: 'Bahasa Melayu' },
]

/** Most translation languages a user can choose; the pill shows one chip for each. */
export const MAX_TRANSLATION_TARGETS = 3

/**
 * The canonical code of a supported translation language, matched case-insensitively. Older
 * configs stored plain `zh`, which is Simplified Chinese now. Returns null when unsupported.
 */
export function canonicalTranslationCode(value: string): string | null {
  const lower = value.trim().toLowerCase()
  if (lower === 'zh') return 'zh-Hans'
  return TARGET_LANGUAGES.find((language) => language.value.toLowerCase() === lower)?.value ?? null
}

/** Display name of a translation language in the current UI language. */
export function targetLanguageLabel(code: string, t: (key: string) => string): string {
  const language = TARGET_LANGUAGES.find((item) => item.value === code)
  if (!language) return code
  return language.labelKey ? t(language.labelKey) : language.label
}

/** Short chip labels for the pill's translation targets (at most two glyphs each). */
export const TARGET_LANGUAGE_SHORT_LABELS: Record<string, string> = {
  en: 'EN',
  'zh-Hans': '简',
  'zh-Hant-HK': '港',
  'zh-Hant-TW': '台',
  ja: '日',
  ko: '한',
  fr: 'FR',
  de: 'DE',
  es: 'ES',
  pt: 'PT',
  ru: 'RU',
  ar: 'ع',
  hi: 'हि',
  th: 'ไท',
  vi: 'VI',
  it: 'IT',
  nl: 'NL',
  tr: 'TR',
  pl: 'PL',
  uk: 'UK',
  id: 'ID',
  ms: 'MS',
}
