# Main window cleanup

The main window becomes three tabs: **Home**, **Settings**, **Dictionary**, with **About** pinned
to the bottom of the sidebar. History is removed
completely, so Typelite keeps no record of what the user said. Home shows the current setup and
what changed in this version instead of usage counters. "Scenes" is renamed "Prompt Presets".

Status: agreed — 2026-09-24

## Goals

- No stored record of dictations, anywhere on disk.
- A Home tab that answers "is my setup right?" and "what's new?" at a glance.
- Dictionary is one click away instead of inside Settings.
- Names the user recognises: "Prompt Presets" instead of "Scenes".

## Non-goals

- New dictionary or prompt-preset features. This plan only moves and renames them.
- Renaming internal code identifiers for scenes (`scene`, `ScenesPane`); only user-facing text.

## Key decisions

| Decision | Reason |
|---|---|
| Remove History entirely, including the stored table and the "Save history" setting | The user wants no record of dictations. |
| Existing history rows are deleted on startup (the table is dropped) | Old test data should not linger after the feature is gone. |
| Anything that needs "the last result" keeps it in memory only | Nothing about a dictation is written to disk. |
| Home = current configuration card + "What's New" | Counters were not useful; setup and changes are. |
| App version is 0.1.0 | First Typelite release. |
| Dictionary becomes the third main tab | It is used often and is not really a setting. |
| New Settings → System section (launch at login, show in Dock) | App-level switches belong apart from dictation settings. |
| About moves to the main sidebar, pinned at the bottom | It is not a setting; bottom placement keeps it out of the way. |
| "Scenes" → "Prompt Presets" in all UI text | Says what they are: saved AI writing prompts. |
| Prompt Presets gets two sub-tabs, Prompts and Apps | Replaces one long scroll; app writing modes stay here as their own tab. |

## Parts

| File | Covers |
|---|---|
| [changes.md](changes.md) | Each tab's new content, and what is removed. |

## Open questions

- None.
