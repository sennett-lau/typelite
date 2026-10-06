# Built-in speech: encoder window sized to the clip

Built-in speech spent about 2 s on every dictation, even a one-second one, because whisper.cpp
encodes a full 30 s window. Typelite now passes a smaller encoder window (`audio_ctx`) for short
clips, which halves recognition time for typical dictations without changing transcripts.

Status: building (2026-10-05)

## Goals

- Faster built-in speech recognition for short dictations, the common case.
- No change in transcripts or language detection; long dictations unchanged.

## Non-goals

- A new speech runtime or model (see the MLX decision and the Phonon-2 discussion).
- Changing speech servers other than built-in speech.

## Key decisions

- **Window = max(15 s, 1.5 × clip), full from 20 s.** Smaller windows garbled short clips and
  Cantonese and dropped Chinese from a mixed clip; 15 s was the smallest that kept every
  benchmark transcript ([report](../../benchmarks/reports/2026-10-05-whisper-audio-ctx/README.md)).
- **Fixed rule, no setting.** Users cannot judge the accuracy tradeoff; a constant is easy to
  revert if real voices show a problem.
- **Measured with the existing real-inference example** and a new A/B script in
  `benchmarks/runtime/`, so the next change can reuse it.

## Parts

| File | Covers |
| --- | --- |
| `index.md` | The whole change; it is small enough for one file. |

## Open questions

- Does the 15 s minimum hold for real recordings with pauses, accents and noise? Revisit with
  real-voice fixtures if reports come in.
