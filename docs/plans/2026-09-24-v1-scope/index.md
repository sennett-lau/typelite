# v1 scope

Typelite v1 is a Tauri 2 app (React/TypeScript frontend, Rust backend) with a Typeless-style
capsule, the Dictate / Ask / Translate modes, voice-edit and paste. It talks only to
self-hosted, OpenAI-compatible speech and AI endpoints and has no accounts or cloud services.

Status: done — 2026-09-24

Superseded in part by [qwen-cloud-speech](../2026-09-25-qwen-cloud-speech/index.md): Qwen Cloud is a
hosted speech service with its own API.

Supersedes the stack and architecture decisions in [initial-concept](../2026-09-24-initial-concept/index.md).
The product targets in plan `initial-concept`'s `product.md` and the backend notes in `speech-and-ai.md` still apply.

## Goals

- A working Typeless replacement on macOS.
- Only self-hosted, OpenAI-compatible speech and AI endpoints, set up through presets.
- No paid plan, accounts, sign-in or checkout anywhere in the app.
- Mic choice, and recording shortcuts by pressing keys.
- A live voice waveform in the pill, and quick switching between three translation languages.

## Non-goals

- Windows and Linux work. The code stays cross-platform where it already is, but only macOS is
  tested.
- A native Swift rewrite (see [initial-concept](../2026-09-24-initial-concept/index.md) for that option).

## Key decisions

| Decision | Reason |
|---|---|
| Tauri 2 with a Rust backend | The capsule, modes and paste flow were available to build on quickly. |
| One provider type each for speech and AI: OpenAI-compatible endpoint + presets | Covers whisper.cpp, Speaches, Ollama and anything else we test, with far less code. |
| Record shortcuts through the native key listener, not the web view | Only the native side sees Fn, End and left/right modifiers. |
| No accounts or cloud features | Free, self-hosted and private by design. |
| No auto-updater yet | Nothing to update from until Typelite has releases. |

## Parts

| File | Covers |
|---|---|
| [identity.md](identity.md) | Names, identifiers, licence, build. |
| [local-only.md](local-only.md) | No accounts or cloud; network check. |
| [providers.md](providers.md) | Custom endpoints and presets. |
| [mic-selection.md](mic-selection.md) | Choosing the input microphone. |
| [shortcut-capture.md](shortcut-capture.md) | Recording shortcuts by pressing the real keys, Typeless-style. |
| [capsule-waveform.md](capsule-waveform.md) | A live voice waveform in the pill while recording. |
| [translation-languages.md](translation-languages.md) | Three pre-selected target languages, switched from the pill. |

## Open questions

- None.
