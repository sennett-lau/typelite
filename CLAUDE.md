# typelite

Open-source, free, self-hosted alternative to [Typeless](https://www.typeless.com/): press a
shortcut, speak, and get polished text pasted into whatever field has focus. macOS first.

Stack: Tauri 2 (React/TypeScript frontend, Rust backend), MIT. Scope and decisions are in
`docs/plans/2026-09-24-v1-scope/` and later plans. The user is new to macOS development, so keep the
code plain and explain macOS-specific APIs when you use them.

Local-only notes (sibling folders, machine setup) live in `CLAUDE.local.md`, which is not
committed. Never commit names, links or paths that point at other projects this code was
built from.

## Plans

Plans live in `docs/plans/YYYY-MM-DD-short-slug/` (the date the plan was created), one folder per
feature, each with an `index.md` and small part files. The slug is unique and identifies the plan;
there is no running number. Refer to a plan by its slug ("plan `quick-speech-setup`"), never by a
number. They describe intent and structure, never to-do lists. Follow the rules in
`docs/plans/README.md` whenever you create or change a plan. Read the relevant plan before
building a feature.

## Hard constraints

- Everything must be free and open source. No paid APIs or cloud STT/LLM by default; a cloud
  service is used only when the user opts in with their own key (plan `qwen-cloud-speech`).
- Must be reliable and safe: no telemetry, no cloud sign-in, audio stays on the user's machines
  unless they choose such a service.
- Main target is macOS (Apple Silicon, M1 Pro, 32 GB, macOS 26). Windows is a non-goal for now.
- Keep resource use low. The LLM only rephrases and summarises; it does not need a large model.

## Target UX (copy Typeless)

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

## Architecture

```
Typelite ──audio──> speech recognition (built-in whisper.cpp, or an OpenAI-compatible server)
         ──text───> AI polish (built-in llama-server, or an OpenAI-compatible chat server)
         <─polished text── paste into the focused app
```

The developer's own machines, addresses and services are described in `CLAUDE.local.md`
(not committed). Never put private addresses or machine names in committed files.

## Licence

MIT. `LICENSE` holds every required copyright notice; keep it intact. Do not copy code from
GPL projects.

## Testing and logs

- Offline gate: `cd src-tauri && cargo test --lib`, `cargo fmt --check`, `npx vitest run`,
  `npx tsc --noEmit`, `npx eslint src/`, `npx prettier --check src`.
- End-to-end against real servers: `bash scripts/e2e.sh` (whisper.cpp + an OpenAI-compatible
  chat server; set `TYPELITE_E2E_AI_URL` etc., see `src-tauri/tests/e2e_services.rs`). Speech
  audio is synthesised with macOS `say`. Built-in AI: `bash scripts/build-llama-server.sh`, then
  set `TYPELITE_E2E_LLAMA_MODEL` to a Qwen3 GGUF file.
- The app logs to `~/Library/Logs/Typelite/typelite.log` (timings, sizes, errors; never dictated
  text). Each speech request logs endpoint, status and duration; `[Pipeline Timing]` lines give
  the per-step breakdown. Ask the user for this file when debugging a report.
- Drive a dictation without the keyboard: `/Applications/Typelite.app/Contents/MacOS/typelite
  toggle` starts, a second call stops. The result is pasted into the frontmost app, so open an
  empty TextEdit document first.

## Lessons learned (do not relearn these)

- CoreAudio can keep an input stream's callback alive after the stream is dropped. Never rely on
  that drop to close a channel; close it explicitly (see `audio/capture.rs`).
- Whisper invents text ("Thank you.") for audio without speech, and "loudest moment above a
  threshold" is not a speech test: the shortcut key's click or a mic bump passes it. Every
  speech provider runs the voice check in `stt/silence.rs` before recognition: ignore the first
  and last 80 ms, take the 10th-percentile 20 ms window as the noise floor, count windows above
  −45 dBFS and 12 dB above that floor, and need 200 ms of them (a click gives ~20 ms, a bump
  ~100 ms, a quiet "Yes." ~300 ms). After recognition, built-in whisper drops segments with
  no-speech > 0.6 and average log-prob < −1.0, and `stt/hallucination.rs` drops a transcript
  that is only a known Whisper phrase when under 1.5 s was voiced. Then the pill shows "Didn't
  catch that" and nothing is pasted. The log line "speech check: …" gives the numbers.
- Built-in speech (in-process whisper.cpp, `stt/builtin.rs`): GGML's Metal backend aborts the
  process in its exit-time cleanup if a model is still loaded, so the model is freed on
  `RunEvent::Exit` (and at the end of tests). whisper.cpp is built by cmake at the crate's
  opt-level, so `Cargo.toml` forces `opt-level = 3` for `whisper-rs-sys` in every profile.

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
- Built-in AI (`llm/builtin.rs`): llama-server built with embedded Metal shaders compiles them
  on its first launch, which blocks for one to two minutes (even `llama-server --version`);
  macOS caches the result per binary. Tauri's build script fails when a listed `externalBin` is
  missing, so llama-server is listed only in `src-tauri/tauri.bundle.conf.json`
  (`npm run build:app`).
- Only Command Line Tools are installed on this Mac. `xcodebuild` needs full Xcode.
- The global Rust default is pinned to 1.85.0 on purpose. Use `rustup override set stable` per
  project instead of changing the default.
- Windows auto-creates "block" firewall rules for a new listening exe the first time it runs.
  They override allow rules, so check for them.
