# Wake word: own voice gate + Whisper on short segments

**Status:** decided, 2026-10-09. Outcome: **adopted** for plan
[hands-free-mode](../../plans/2026-10-09-hands-free-mode/index.md).
Evidence: [results.json](results.json). Method and tables:
[measurements.md](../../plans/2026-10-09-hands-free-mode/measurements.md).

**Scope:** Apple M1 Pro / 32 GB, macOS 26.5, whisper.cpp via whisper-rs 0.16 (Metal), Whisper
tiny and base (q5_1), 76 synthetic `say` clips (27 wake, 47 other, 72 s of background talk),
with noise mixed in. Not covered: real voices and rooms, other Macs, Intel Macs, hours-long
false-wake rates, and the other approaches below, which were compared on paper only.

## Question

How should Typelite detect "Hey Sam" while the microphone is always on? The owner's limits: no
extra install for users, no vendored external project, nothing heard leaves the Mac before the
wake phrase, and a low resource cost.

## Decision

Use Typelite's own pipeline: an in-memory ring buffer, its own energy and noise-floor voice gate
in Rust, and a check of each voiced segment of 2 s or less with the whisper.cpp it already
ships. The check uses Whisper base q5_1 (60 MB, downloaded by the app), a prompt with the wake
name, a 512-frame encoder window and Typelite's own fuzzy matcher.

## Why

- **Nothing new to install or vendor:** whisper.cpp is already in the app, and the model comes
  through the existing download and SHA-256 path.
- **Cheap where it matters:** silence never reaches the model (0.004% of one core). A check costs
  37 ms (p50) on the GPU and 12 ms of CPU. Background talk averaged 0.18% of one core.
- **Accurate enough to ship behind a switch:** 26/27 wake phrases and 0/47 other utterances on
  synthetic voices, and no false wake in 72 s of talk that mentions "Sam" and "Hey".
- **Any wake name works at once:** the name is text, not a trained class.

## Alternatives considered

| Approach | Why not (now) |
| --- | --- |
| Trained keyword model (own) | Needs a training pipeline, data and a data card, and supports only fixed phrases. Kept as [phase 2](../../plans/2026-10-09-hands-free-mode/phase-2.md) |
| openWakeWord | A separate runtime (ONNX) and pretrained models under their own licences. The owner ruled out vendoring. Ideas only |
| sherpa-onnx keyword spotting | A large external C++ project with ONNX Runtime and its own models. The same objection |
| Silero VAD as the gate | Another model and runtime for something the energy gate already does well enough here. The voice check's thresholds are proven in the app |
| Apple Speech (SFSpeechRecognizer) on-device | Needs a fixed locale and no mixed Cantonese/English (see CLAUDE.md lessons), plus a separate permission. Its streaming recogniser is not meant to run all day |
| Whisper tiny | 22/27 accepted, with repeated text; the 28 MB saved is not worth five times the misses |
| Whisper base without prompt / with the full phrase as prompt | 23/27 / 18/27 accepted. The full-phrase prompt makes Whisper drop "Hey Sam" from "Hey Sam, what's …" |

## Reopen when

- A real-voice test set (at least 5 speakers, 2 rooms) shows a false-reject rate above 10% at
  Normal, or
- real use logs more than about one false wake per day of normal office sound, or
- wake checks use more than 3% of one core on average during an hour of nearby conversation, or
- the app adds an ONNX or other neural runtime for another reason, which would make a trained
  keyword model cheap to ship.
