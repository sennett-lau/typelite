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

export const TARGET_LANGUAGES: { value: string; label: string; labelKey?: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
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

/** The pill shows the first three translation targets as chips; the Translate shortcut cycles them. */
export const PILL_TRANSLATION_TARGETS = 3

/** Short chip labels for the pill's translation targets (at most two glyphs each). */
export const TARGET_LANGUAGE_SHORT_LABELS: Record<string, string> = {
  en: 'EN',
  zh: '中',
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
