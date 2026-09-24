# typelite

Open-source, free, self-hosted alternative to [Typeless](https://www.typeless.com/): press a
shortcut, speak, and get polished text pasted into whatever field has focus. macOS first.

Stack: Tauri 2 (React/TypeScript frontend, Rust backend), MIT. Scope and decisions are in
`docs/plans/0002-v1-scope/` and later plans. The user is new to macOS development, so keep the
code plain and explain macOS-specific APIs when you use them.

Local-only notes (sibling folders, machine setup) live in `CLAUDE.local.md`, which is not
committed. Keep private machine details out of committed files. Document public design and
architecture references accurately, and retain any required notices for reused code.

Other projects may be used as references for product design, UX and stack research.
A request to compare or reference another project does not authorise importing its code or
assets. Develop features against Typelite's own requirements; obtain explicit approval before
adding code from a reference project and preserve its required licence notices.

## Plans

Plans live in `docs/plans/NNNN-short-slug/`, one folder per feature, each with an `index.md`
and small part files. They describe intent and structure, never to-do lists. Follow the rules in
`docs/plans/README.md` whenever you create or change a plan. Read the relevant plan before
building a feature.

## Hard constraints

- Everything must be free and open source. No paid APIs, no subscriptions, no cloud STT/LLM.
- Must be reliable and safe: no telemetry, no cloud sign-in, audio stays on the user's machines.
- Main target is macOS (Apple Silicon, M1 Pro, 32 GB, macOS 26). Windows is a non-goal for now.
- Keep resource use low. The LLM only rephrases and summarises; it does not need a large model.

## Target UX (Typeless as a reference)

- A pill ("capsule") at the bottom-centre of the screen the user is working on, showing
  recording → transcribing → polishing. It must never take focus from the target app.
- Three shortcuts, configurable. App defaults follow Typeless: Dictate `Fn`, Translate `Fn + Shift`,
  Ask anything `Fn + Space`. The user's own bindings (their external keyboard has no Fn key):
  - Dictate: `End` (tap to start, tap to stop)
  - Ask anything: `End + Right Control`
  - Translate: `End + Right Shift`
  The End key must be swallowed so it does not move the cursor in the focused app.
- Output: put text on the clipboard, send ⌘V to the focused app, then restore the previous
  clipboard. Needs Accessibility permission.
- Voice-edit of selected text ("make this shorter") and per-app tone are nice-to-haves.

## Current architecture (working prototype)

```
Mac client ──audio──> whisper.cpp server on the Mac (127.0.0.1:8178, large-v3-turbo q5_0, lang auto)
           ──text───> Ollama on sennett-pc over Tailscale (:11434, qwen3:4b-instruct-2507-q4_K_M)
           <─polished text── paste into focused app
```

- STT: `whisper-server` from Homebrew `whisper-cpp`, run by the LaunchAgent
  `~/Library/LaunchAgents/com.typelite.whisper-server.plist`. Model at
  `~/.local/share/whisper/ggml-large-v3-turbo-q5_0.bin`. OpenAI-compatible path
  `/v1/audio/transcriptions`, returns `{"text": ...}`. About 2 s for a short clip.
- LLM: Ollama (Windows native, not WSL) on `sennett-pc`. Starts at logon through the scheduled
  task `Ollama`. User env: `OLLAMA_HOST=0.0.0.0:11434`, `OLLAMA_KEEP_ALIVE=-1`,
  `OLLAMA_CONTEXT_LENGTH=4096`, `OLLAMA_FLASH_ATTENTION=1`. The firewall rule
  "Ollama (Tailscale only)" allows only `100.64.0.0/10`. About 3 GB VRAM, about 0.15 s per
  cleanup once warm. SSH details for the PC are in the global `~/.claude/CLAUDE.md`.

## Licence

MIT. Keep the required copyright and permission notices in `LICENSE` and
`THIRD_PARTY_NOTICES.md` intact. Do not copy code from GPL projects.

## Lessons learned (do not relearn these)

- **macOS permissions and rebuilds:** an ad-hoc-signed app gets a new cdhash on every build, so
  macOS silently ignores the old Accessibility grant (it still shows "on"). Check the grant's
  requirement with `sqlite3 "/Library/Application Support/com.apple.TCC/TCC.db"` plus `csreq`,
  and compare it with `codesign -dr -`. Fix with `tccutil reset Accessibility <bundle-id>` and
  grant again, or sign every build with one stable self-signed certificate.
- An event tap created before Accessibility is granted fails, so the app must restart after the
  grant (or retry until it succeeds).
- Starting the app from a terminal makes TCC check the terminal's permissions. Start it with
  `open -a ... --env RUST_LOG=info --stdout <log> --stderr <log>` to get logs as the app itself.
- Multi-monitor with mixed scale (Retina 2x plus 1x externals): do window maths in logical
  points and convert each monitor with its own scale factor. Never read a window position back,
  change it and write it again, or it drifts.
- Qwen3.5 in Ollama thinks by default. Through the OpenAI API without a thinking-off flag it
  thinks for about 27 s and returns empty `content`. Use a non-thinking instruct model, or send
  `reasoning_effort: "none"`.
- Apple Speech needs one fixed locale and has no auto-detect. whisper.cpp with `-l auto` handles
  mixed English, Cantonese and Mandarin (Cantonese comes out as standard written Chinese).
- Only Command Line Tools are installed on this Mac. `xcodebuild` needs full Xcode.
- The global Rust default is pinned to 1.85.0 on purpose. Use `rustup override set stable` per
  project instead of changing the default.
- Windows auto-creates "block" firewall rules for a new listening exe the first time it runs.
  They override allow rules, so check for them.
