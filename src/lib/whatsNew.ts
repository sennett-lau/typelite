/**
 * "What's New" on the Home tab. One entry per release, newest first. Each change is an i18n
 * key under `whatsNew.` so the list follows the UI language; add both en and zh strings.
 */
export interface WhatsNewEntry {
  /** Release version without the leading "v", e.g. "0.1.0". */
  version: string
  /** i18n keys (under `whatsNew.`) for the changes in this release. */
  changeKeys: string[]
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: '0.1.0',
    changeKeys: [
      'rename',
      'presets',
      'microphonePicker',
      'pressKeysShortcut',
      'liveWaveform',
      'translationLanguages',
      'setupTutorial',
      'nativeGlass',
      'noHistory',
    ],
  },
]
