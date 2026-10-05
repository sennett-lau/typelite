# Evaluate pure-Rust inference

Could built-in speech and AI run on a pure-Rust inference library instead of whisper.cpp and
llama.cpp, with fewer languages in the codebase and possibly better speed?

Status: done (2026-10-05). Decision: keep the C++ engines
([decision](../../benchmarks/decisions/2026-10-05-rust-inference.md)).

## Goals

- Measure candle against the shipping engines with the same models, inputs and harnesses.
- Record the decision and when to revisit it, as for the MLX evaluation.

## Non-goals

- Changing the app; the prototypes live in `benchmarks/runtime/candle/`, outside its build.

## Key decisions

- **candle, not a rewrite.** It already implements Whisper and Qwen3 with Metal; a rewrite would
  have to beat GGML's kernels from scratch.
- **Same weights where possible.** Text uses the app's exact GGUF; speech uses the same
  checkpoint in the format candle supports (F32 safetensors).
- **Own decoding code around candle's model,** so no example code needed licence review.

## Parts

| File | Covers |
| --- | --- |
| `index.md` | The whole evaluation; results are in the report. |

## Open questions

- None.
