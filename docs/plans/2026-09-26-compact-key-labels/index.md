# Compact key labels

Shortcut keys are drawn the way macOS menus draw them: ⌃ ⌥ ⇧ ⌘ for the modifiers, with a small
side letter (R or L) inside the same key cap when the shortcut needs one particular side. "End +
Right Control" becomes two caps, `End` and `⌃R`, and fits a Home tile. Every cap keeps the full
name as its tooltip and for screen readers. The visual reference is option B of
[mock.html](mock.html).

Status: building — 2026-09-26

## Goals

- Shortcuts fit on one line on the Home tiles, in Settings, in onboarding and in the pill.
- One look everywhere a key cap is drawn, from one shared component.
- Nobody loses information: the full key name is one hover away and is what a screen reader
  reads.

## Non-goals

- Translating key names. Full names stay English ("Right Control"), as before.
- Changing how shortcuts are stored, matched or recorded.
- Rust-side messages: they name shortcuts by their stored form (`End+RightShift`), not by a
  display label, so they stay as they are.

## Key decisions

| Decision | Reason |
|---|---|
| Control ⌃, Option ⌥, Shift ⇧, Command ⌘ | The symbols macOS itself uses in menus; shortest and familiar. |
| A side-specific key adds a small side letter after the symbol (`⌃R`, `⌥L`, `⇧R`) | The side matters to the native listener; a letter is the smallest clear mark. |
| A generic modifier (either side) is the bare symbol: Shift (either side) is `⇧` | No letter already means "no particular side"; the old "(either side)" label goes. |
| Return ↩, Delete ⌫, Forward Delete ⌦, Tab ⇥, Escape `esc`, arrows ← → ↑ ↓ | The symbols macOS menus use. |
| Fn, End, Home, Page Up/Down, Space, F-keys, letters, digits and punctuation are unchanged | They are already short words or single characters. |
| The side letter is 9 px, bold, in the muted text colour, inside the same cap | Reads as a mark on the key, not as a second key. |
| Each cap has `title` = full name, and the full name as visually hidden text (the visible symbol is `aria-hidden`) | Hover shows "Right Control"; screen readers read "Right Control", not a symbol and a letter. A cap whose label already is the full name ("End") needs neither. |
| `displayBinding` / `displayHotkey` return compact text with the side as a plain letter ("End + ⇧R") | Short plain text for places that show text instead of caps (the held keys while recording). |
| `describeBinding` / `describeHotkey` return full names ("End + Right Shift") | For accessible names and tooltips; the recorder button's accessible name uses it. |
| Callers pass key names (`RightShift`), never split display strings | One mapping (`keyParts` in `src/lib/keyLabels.ts`) decides symbol, side and full name; the shared `KeyCap` / `KeyCaps` components draw them. |
| Alt (the non-macOS name) also shows ⌥; Right Alt shows `⌥R` | Same physical key. |

## Parts

| File | Covers |
|---|---|
| [labels.md](labels.md) | The full label table and where key caps are drawn. |
| [mock.html](mock.html) | The options that were shown; option B was chosen. |

## Considered

- Short words ("R Ctrl", "Cmd"): clear on every platform, but longer and not what macOS shows.
- Symbol plus word ("⇧ Shift"): clearest for newcomers, but barely shorter than today.

## Open questions

- None.
