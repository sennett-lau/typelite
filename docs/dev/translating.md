# Translating Typelite

Typelite's interface text lives in one string table per language, in `src/i18n/locales/`:

| File           | Language                                          |
| -------------- | ------------------------------------------------- |
| `en.json`      | English (the source; every other file follows it) |
| `zh.json`      | Simplified Chinese (简体中文)                     |
| `zh-Hant.json` | Traditional Chinese (繁體中文)                    |
| `es.json`      | Spanish (Español)                                 |
| `fr.json`      | French (Français)                                 |
| `de.json`      | German (Deutsch)                                  |
| `ja.json`      | Japanese (日本語)                                 |

The user picks one in Settings → General → Language. Apart from English, the tables began as
machine translations, so corrections from people who speak the language are very welcome.

## Fixing a translation

1. Find the text: search the language's file for the wrong words, or search `en.json` for the
   English text and look up the same key.
2. Change only the value on the right of the colon. Keep the key, the quotes and the comma.
3. Keep every `{{placeholder}}` exactly as it is (`{{version}}`, `{{error}}` …). Typelite fills
   it in; you may move it within the sentence.
4. Leave names as they are: Typelite, macOS, Whisper, Ollama, file names, URLs and key names.
5. Run `npx vitest run src/i18n` and open a pull request. You can also edit the file on GitHub
   in the browser; CI runs the same check.

The check (`src/i18n/__tests__/localeParity.test.ts`) fails when a file is not valid JSON, lacks
a key that `en.json` has, has an extra key, has an empty value, or changes a placeholder.

## Adding a language

1. Copy `en.json` to `<code>.json`, using a BCP 47 code (`pt-BR`, `ko`, `it` …), and translate
   every value.
2. Add one line to `UI_LANGUAGES` in `src/i18n/languages.ts`, with the language's own name as
   the label.
3. Add the tray menu labels for the code in `get_tray_labels` in `src-tauri/src/tray.rs` (seven
   short strings). Without them the tray menu stays in English.

## Adding or changing English text

A new key goes into **every** file in the same place, or the check fails. When you cannot
translate it, put the English text in the other files; a speaker can fix it later.
