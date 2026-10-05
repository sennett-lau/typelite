# Interface languages

Typelite's interface came in English and Simplified Chinese, chosen on the About page. This plan
adds Traditional Chinese, Spanish, French, German and Japanese, moves the choice to
Settings → General, and makes each language a single file that anyone can correct.

Status: building (2026-10-05)

## Goals

- Seven interface languages: English, Simplified Chinese, Traditional Chinese, Spanish, French,
  German, Japanese, in the main window, pill, Ask window and tray menu.
- The language picker sits with the other settings (Settings → General), not on About.
- One string table per language (`src/i18n/locales/<code>.json`) and a short guide
  (`docs/dev/translating.md`), so a speaker can fix a string without reading code.
- CI catches a broken table: missing or extra keys, empty values, changed placeholders.

## Non-goals

- The language of dictation, polish or translation; those have their own settings.
- Translating the docs or guides.
- Detecting the macOS language at first launch (see Open questions).

## Key decisions

- **Keep `zh` as Simplified Chinese and add `zh-Hant`.** Existing configs store `zh`; changing
  its meaning would switch those users' script without asking.
- **`zh-Hant` falls back to English, not to `zh`.** A missing string must never appear in the
  other script.
- **All tables are bundled.** Seven JSON files are small; loading on demand would add a flash of
  English for no gain.
- **New tables start as machine translations,** checked for keys and placeholders, and are
  marked as such in the guide so speakers know corrections are wanted.
- **The list lives in `src/i18n/languages.ts`.** One line per language; i18next and the picker
  read it.

## Parts

| File | Covers |
| --- | --- |
| `index.md` | The whole change; it is small enough for one file. |

## Open questions

- Should a first launch pick the macOS language when Typelite has it?
