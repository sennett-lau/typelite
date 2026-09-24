# Stack

Language, build and packaging. Back to [index](index.md).

## Choices

- **Swift 6**, AppKit for system-level pieces (panel, event tap, pasteboard), SwiftUI for views
  (capsule content, settings, onboarding).
- **Swift Package Manager** is the build system: `Package.swift` at the repo root, one executable
  target for the app plus library targets for the modules in [architecture.md](architecture.md).
- Builds with the **Command Line Tools** only (`swift build`). Full Xcode is optional, for
  SwiftUI previews or Instruments.
- **Minimum macOS 15**, Apple Silicon.
- Editor: VS Code or Cursor with the Swift extension (sourcekit-lsp).

## Packaging

SwiftPM builds a bare executable, so a small script (`make app`) assembles `Typelite.app`:

- `Contents/MacOS/Typelite` (the binary) and `Contents/Info.plist`.
- `Info.plist`: bundle id `dev.typelite.app`, `LSUIElement = true` (menu-bar only, no Dock icon),
  `NSMicrophoneUsageDescription`.
- No App Sandbox: event taps and pasting into other apps need it off.
- Signed with a stable self-signed certificate from the login keychain, so macOS keeps
  permissions across rebuilds (see [macos-integration.md](macos-integration.md)).

## Dependencies

Keep them few. Foundation and AppKit cover networking, audio, pasteboard and events. Expected
later additions: WhisperKit (MIT) for in-process STT, possibly a small shortcut-recorder UI.

## Repo layout (intended)

```
Package.swift
Sources/
  App/  Hotkeys/  Capsule/  Audio/  Transcription/  Polish/  Insertion/  Settings/
Tests/
  <Module>Tests/
Resources/Info.plist
scripts/            build-app, sign, install
docs/plans/
```

## Considered

- **Tauri:** webview capsule, window maths in JS across a bridge, and the
  hard macOS parts still hand-written in Rust. Caused the drift crash and about 360 MB RAM.
- **Electron:** heavier than Tauri, same bridge problem.
- **Xcode project:** needs the full 10–15 GB Xcode and is harder to drive from the terminal.
