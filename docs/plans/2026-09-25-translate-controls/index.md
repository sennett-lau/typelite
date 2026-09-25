# Translate controls

Translate gets its own "switch language" shortcut, and the target languages are exactly the ones
the user added: English by default, up to three.

Status: agreed — 2026-09-25

Changes decisions in [v1-scope translation-languages.md](../2026-09-24-v1-scope/translation-languages.md)
(three fixed default languages; cycling by pressing the Translate shortcut again).

## Goals

- Start, switch language and finish are three clear actions, each on a shortcut.
- The pill and Settings show only the languages the user chose.

## Key decisions

| Decision | Reason |
|---|---|
| Default target list is `["en"]` (English) | The user's rule: English is always the default. |
| Users add up to three languages; at least one stays | Enough for quick switching; matches the pill's space. |
| No pre-filled Chinese/Japanese; the chips show exactly the list | Reflect the user's choice only. |
| New configurable shortcut **Switch language** (default `Shift`, either side) | Separate from starting and finishing. |
| Switch language only listens while a Translate recording is running | So a bare key like Shift can be used without breaking normal typing. |
| Finish a Translate recording with the Translate shortcut again or the Dictate shortcut | Press the same thing you started with; Dictate also works as "finish". |
| The switch shortcut is recorded by pressing keys, like the others | Consistent with the rest of Settings. |

## Parts

| File | Covers |
|---|---|
| [behaviour.md](behaviour.md) | Settings, onboarding, pill, shortcut rules. |

## Open questions

- None.
