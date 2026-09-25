# 0019 — Export and import presets

Users can save their speech and AI presets to a file and load a file someone shared, so a
working setup (for example "Ollama on the office PC") can be passed around.

Status: agreed — 2026-09-25

## Goals

- Export some or all saved presets (speech and AI) to one file; import such a file.
- Safe by default: a shared file never carries API keys unless the user explicitly adds them.

## Non-goals

- Syncing presets between Macs, or sharing through a service. It is a plain file.
- Exporting Built-in presets (they point at a model file on this Mac, not a server), or shipped
  templates the user has not changed.

## Key decisions

| Decision | Reason |
|---|---|
| One JSON file, `*.typelite-presets.json`, with a format version and two lists (`speech`, `ai`); each entry holds kind, name, address, model and the speech language or, for AI, the extra request fields | Readable, easy to send, easy to check. The kind lets a later version add kinds without breaking older readers. |
| API keys are left out by default; an "Include API keys" option is off and warns that anyone with the file can use the key | Keys live in the macOS Keychain and are secrets. |
| Import shows what the file contains (name and host per preset) with checkboxes, then adds the chosen ones; nothing becomes active by itself | The user sees what they add; a shared file cannot switch their setup. |
| A name clash gets a suffix ("Groq (2)"), existing presets are never overwritten | Import cannot destroy anything. |
| Invalid files are rejected with a clear message: wrong format, newer version, bad address; entries of unknown kinds are skipped and counted | A broken or foreign file fails safely. |
| Imported presets are not marked as tested; readiness comes from Test like any new preset | A preset that worked elsewhere may not work here. |
| Export and Import sit in Settings → Speech and Settings → AI next to the preset picker, each for that page's presets, and use the system save and open dialogs | Close to where presets are managed. |

## Open questions

- None.
