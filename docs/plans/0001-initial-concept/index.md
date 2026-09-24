# 0001 — Initial concept

typelite is a native macOS menu-bar app that copies the Typeless experience: tap a shortcut,
speak, and polished text is pasted into whatever app has focus. Speech-to-text runs on the Mac,
text cleanup runs on the user's own GPU PC, and nothing goes to a paid or cloud service. This
plan sets the product shape, the stack and the architecture that later feature plans build on.

Status: dropped — 2026-09-24

Superseded by [0002](../0002-v1-scope/index.md): v1 is a Tauri app instead of a native Swift app.

## Goals

- Typeless-level smoothness on macOS: instant capsule feedback, no focus stealing, reliable paste.
- Three modes on user-chosen shortcuts: Dictate, Ask anything, Translate.
- Mixed-language speech (English, Cantonese, Mandarin) with automatic language detection.
- Free, open source, self-hosted, no telemetry, low resource use on both machines.
- A codebase a first-time macOS developer can read and change.

## Non-goals

- Windows, Linux, iOS.
- Cloud providers, accounts, sync, payments.
- Mac App Store distribution (the sandbox blocks event taps and pasting into other apps).
- Real-time streaming transcription in the first version.

## Key decisions

| Decision | Reason |
|---|---|
| Native Swift: AppKit for system pieces, SwiftUI for views | Every Typeless feature is a native API. |
| Swift Package Manager only, no Xcode project | Builds with the Command Line Tools already installed; no 10–15 GB Xcode; terminal-friendly. |
| Minimum macOS 15 | Modern SwiftUI; the only user is on macOS 26. |
| Menu-bar app (no Dock icon) | Typeless-style background utility. |
| STT: existing whisper-server over HTTP first, behind a swappable protocol | Already works with auto language detection; WhisperKit in-process can replace it later. |
| LLM: Ollama on sennett-pc through its OpenAI-compatible API | Already running on about 3 GB VRAM with about 0.15 s cleanups. |
| Sign every build with one stable self-signed certificate | Keeps Accessibility and Microphone grants across rebuilds. |
| Licence: MIT; reference VoiceInk's design but copy no GPL code | Keeps the licence permissive. |

## Parts

| File | Covers |
|---|---|
| [product.md](product.md) | What the user sees and does: modes, shortcuts, capsule states, flows. |
| [architecture.md](architecture.md) | Modules, data flow, threading, error handling. |
| [stack.md](stack.md) | Language, build, packaging, signing, repo layout, tooling. |
| [macos-integration.md](macos-integration.md) | Event tap, capsule panel, paste, Accessibility, permissions. |
| [speech-and-ai.md](speech-and-ai.md) | STT and LLM backends, prompts, latency budget, fallbacks. |

## Open questions

- Ask and Translate: tap-to-toggle like Dictate, or hold-to-talk while the combo is held?
- Translate: what goes in (speech, or the selected text) and how the target language is picked.
- Where Ask answers appear: a floating card by the capsule, or pasted like dictation.
- Whether to keep the raw audio and transcript history locally, and for how long.
- When to move STT in-process (WhisperKit) and drop the whisper-server LaunchAgent.
