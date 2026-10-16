# Phase 2 (proposal): an own small keyword model

A proposal, not built: what to do if Whisper on segments turns out too heavy or too inaccurate
in real use. Part of [hands-free-mode](index.md).

## When to do it

Do this work only if real-use data meets one of the conditions in the research entry's "Reopen
when" ([wake-word](../../research/2026-10-09-wake-word/index.md)): a real-voice false-reject
rate above 10%, false wakes more often than about once a day, or wake checks above 3% of one
core during normal office talk.

## The idea

This follows the published approach of small keyword spotters (openWakeWord, the keyword
spotting in sherpa-onnx, and the "Hey Snips" and Howl papers). Only ideas from their public
docs and papers are used, never their code or models.

```text
16 kHz ─> log-mel (40 bins, 10 ms) ─> frozen small encoder ─> tiny classifier ─> score/frame
                                       (Whisper base encoder,   (2 dense layers,
                                        already downloaded)      ~50 k weights)
```

- **Features:** reuse Whisper base's encoder (already on disk and run by whisper.cpp) as a frozen
  feature extractor. Only a tiny head is trained, so there is no new runtime and no extra
  download beyond a few hundred KB of weights.
- **Head:** two dense layers over a 1.5 s window of encoder frames, giving a "Hey Sam" score. It
  runs in plain Rust (a few matrix multiplications), with no ML library.
- **Training data:** synthetic positives from macOS `say` and other free TTS voices with room
  impulse responses and noise, plus negatives from public speech corpora with licences that
  allow it. Training runs offline in a script under `benchmarks/` and is reproducible. The
  weights are committed with their data card.
- **Custom names:** the head knows only the trained phrase. A custom wake name would keep the
  Whisper check (phase 1) as a fallback, or use a short on-device fine-tune from 3–5 user
  recordings.

## Expected gain

Encoder only, without the decoder: about half of today's 37 ms per check. The fixed window
needs no segmenter cut-off, and accuracy can be tuned per phrase. The costs are training
infrastructure, a data card, and a weaker story for custom names.
