# Architecture

How the app is put together. Back to [index](index.md).

## Modules

Each module is a small Swift target with one job, so it can be read and tested on its own.

| Module | Job |
|---|---|
| `Hotkeys` | Event tap that turns key events into mode start/stop events and swallows bound keys. |
| `Capsule` | The floating panel and its SwiftUI view; placement on the right screen. |
| `Audio` | Microphone capture at 16 kHz mono, levels for the waveform, WAV encoding. |
| `Transcription` | `Transcriber` protocol plus implementations (whisper-server HTTP first). |
| `Polish` | `Polisher` protocol plus the OpenAI-compatible chat client; prompts per mode. |
| `Insertion` | Clipboard save, write, ⌘V, restore; reads selected text when needed. |
| `Settings` | Stored preferences and the settings window. |
| `App` | Menu-bar entry, permissions onboarding, and the session coordinator. |

## Data flow

```
Hotkeys ──mode start/stop──> Coordinator ──state──> Capsule
                                │
                  Audio ──WAV──>│──> Transcriber ──text──> Polisher ──text──> Insertion
```

The **session coordinator** owns one dictation session at a time and is the only place that
changes state: `idle → recording → transcribing → polishing → inserting → idle` (or `error`).
The capsule only renders the state it is given; it never decides anything.

## Threading

- The event tap runs on its own thread and only posts small events to the coordinator.
- The coordinator and all UI run on the main actor.
- Network and file work are `async` and never block the main thread.

## Errors and fallbacks

- STT fails: show the error in the capsule and keep the audio so the user can retry.
- LLM fails or times out (about 3 s): paste the raw transcript and say so in the capsule.
- Paste fails (no Accessibility grant): leave the text on the clipboard and say so.
- Every failure is logged locally; nothing is sent anywhere.

## Swappable backends

`Transcriber` and `Polisher` are protocols, so a new backend (WhisperKit, Apple Speech, a
different LLM server) is a new type plus a settings option, with no changes to the coordinator.
