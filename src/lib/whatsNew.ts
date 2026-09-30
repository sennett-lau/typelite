/**
 * "What's New" on the Home tab. One entry per release, newest first. Each change is an i18n
 * key under `whatsNew.` so the list follows the UI language; add both en and zh strings.
 */
export interface WhatsNewEntry {
  /** Release version without the leading "v", e.g. "1.0.0". */
  version: string
  /** i18n keys (under `whatsNew.`) for the changes in this release. */
  changeKeys: string[]
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: '1.0.1',
    changeKeys: [
      'polishCorrections',
      'polishRequests',
      'polishCodeWords',
      'polishSpelledNames',
      'installWindow',
      'tutorialClose',
    ],
  },
  {
    version: '1.0.0',
    changeKeys: [
      'builtin',
      'ownServer',
      'qwen3Asr',
      'shortcuts',
      'translationLanguages',
      'languagePresets',
      'pill',
      'insights',
      'presets',
      'microphonePicker',
      'setupTutorial',
      'nativeGlass',
      'noHistory',
    ],
  },
]
