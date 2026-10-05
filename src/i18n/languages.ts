/**
 * Plan `ui-languages`: the interface languages. Each one is a string table in
 * `src/i18n/locales/<code>.json` (see docs/dev/translating.md). To add a language, add its file
 * and one line here; the tray menu labels are in `src-tauri/src/tray.rs`.
 *
 * `zh` is Simplified Chinese: the code older configs stored, so it stays.
 */
import en from './locales/en.json'
import zh from './locales/zh.json'
import zhHant from './locales/zh-Hant.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import ja from './locales/ja.json'

export const UI_LANGUAGES = [
  { value: 'en', label: 'English', messages: en },
  { value: 'zh', label: '简体中文', messages: zh },
  { value: 'zh-Hant', label: '繁體中文', messages: zhHant },
  { value: 'es', label: 'Español', messages: es },
  { value: 'fr', label: 'Français', messages: fr },
  { value: 'de', label: 'Deutsch', messages: de },
  { value: 'ja', label: '日本語', messages: ja },
] as const
