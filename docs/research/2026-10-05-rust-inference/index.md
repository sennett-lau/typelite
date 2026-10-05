# Keep whisper.cpp and llama.cpp rather than pure-Rust inference (candle)

**Status:** decided, 2026-10-05. Outcome: **rejected**. Shipping behavior unchanged.
Evidence: [report](report.md) and raw data ([speech](speech.json), [text](text.json)).

**Scope:** Apple M1 Pro / 32 GiB, candle 0.11 on Metal, large-v3-turbo speech and
Qwen3-1.7B Q4_K_M polishing (the app's pinned file), synthetic speech fixtures. Not covered:
the default Qwen3-4B model, other Macs, other Rust libraries (see Considered). Related:
[mlx-runtime](../2026-10-03-mlx-runtime/index.md), the other runtime evaluated.

## Decision

The built-in speech and AI engines stay whisper.cpp (through whisper-rs) and llama.cpp's
llama-server. candle 0.11, the most complete pure-Rust option, was tested with the same models
and inputs.

## Why

- **AI polish 2.3–2.4× slower** (prefill and total), decode 3× slower, and on the long dictation
  it answered in another language from the same weights.
- **Speech:** faster only for short outputs (10–22%), 49–56% slower for 18–19 s dictations, model
  load ~11× slower, first call up to 10 s, and F32 only: 3.2 GB in memory against 574 MB.
  whisper.cpp with the encoder-window change is already faster for short clips.
- **Fewer languages only in part:** candle's Metal backend ships its own shader code, and
  llama-server's C++ would be replaced by a Rust server the app would have to build and own.

## Considered

- Rewriting whisper.cpp/llama.cpp from scratch in Rust: far more work than a library swap, with
  GGML's tuned Metal kernels as the bar to beat.
- mistral.rs (built on candle) for text: same kernels, so the same speed class; not tested.
- burn: no maintained Whisper or Qwen3 implementation with quantized Metal inference.

## Reopen when

- candle (or another Rust library) gains quantized Whisper for large-v3-turbo, a decoder KV
  cache for Whisper, and Q4_K Metal kernels within 20% of llama.cpp on this report's harness; or
- the app needs a feature the C++ engines cannot provide.
