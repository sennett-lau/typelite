# Quick speech setup

A user with no speech server, preset or API key can get speech recognition working with one
button: Typelite downloads a Whisper model with a progress bar and runs whisper.cpp inside the
app. No Homebrew, Terminal or background server.

Status: agreed — 2026-09-25

## Goals

- One click from "nothing set up" to working speech recognition on a Mac.
- Clear progress and honest errors (disk space, network, checksum).
- Keep every existing option: servers on the network and cloud keys still work as presets.

## Non-goals

- A one-click AI (LLM) setup. Possible later; not in this plan.
- Streaming recognition.

## Key decisions

| Decision | Reason |
|---|---|
| Run whisper.cpp in-process through a Rust binding (with Metal) as a new speech provider type "Built-in (this Mac)" | Nothing to install or keep running; no Homebrew dependency; no HTTP round trip. |
| Quick setup downloads the model from the official whisper.cpp Hugging Face repository and verifies SHA-256 | We host nothing; the file is checked. |
| Default model `large-v3-turbo` quantised (about 574 MB); offer "Smaller and faster" `small` (about 190 MB) | Best accuracy by default, with a lighter choice for slower Macs or disks. |
| Models live in `~/Library/Application Support/dev.typelite.mac/models/` | App data, removed with the app's data; visible in Settings with a delete button. |
| The model loads on first use and unloads after 10 minutes idle | Keeps memory low when the user is not dictating. |
| Quick setup is offered wherever speech is not ready: onboarding Speech step, Home "Finish setup" card, Settings → Speech | The same one button everywhere. |
| After setup, a built-in preset "Built-in (this Mac)" is created, selected and marked ready after an automatic test | No extra steps. |

## Parts

| File | Covers |
|---|---|
| [behaviour.md](behaviour.md) | Screens, download flow, provider details, errors. |

## Open questions

- None.
