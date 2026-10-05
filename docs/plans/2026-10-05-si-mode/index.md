# SI mode

A small joke setting: Settings → System → "Super intelligence mode" shows every "AI" in
Typelite's interface as "SI", and "artificial intelligence" as "super intelligence" (Chinese:
人工智能 → 超级智能). It is off by default and changes nothing but interface text.

Status: building (2026-10-05)

## Goals

- One switch that renames AI to SI across the whole interface: main window, pill and Ask
  window, in English and Chinese.
- Takes effect at once, without a restart.

## Non-goals

- Changing prompts sent to models, logs, the tray menu, What's New history in the repo, or any
  text Typelite pastes.
- Renaming code, settings keys or files.

## Key decisions

- **An i18next post-processor (`src/i18n/siMode.ts`), not edited copies of the locale files.**
  Every translated string passes through it, so new strings are covered with no extra work.
- **Whole-word match on `AI`.** "OpenAI" and similar words stay as they are.
- **Stored in the app config as `si_mode`.** The config patch event carries it to the pill and
  Ask windows, as it does for the interface language; a per-window copy in `localStorage` makes
  the first paint right.
- **The switch's own hint avoids the words it replaces**, so it reads the same on and off.

## Parts

| File | Covers |
| --- | --- |
| `index.md` | The whole feature; it is small enough for one file. |

## Open questions

- None.
