# Retain C++ defaults; defer MLX speech adoption

**Status:** decided, 2026-10-03. Shipping behavior unchanged.

**Scope:** Apple M1 Pro / 32 GiB, large-v3-turbo speech and Qwen3-1.7B polishing.
This does not reject MLX generally or cover the untested default Qwen3-4B model,
other Macs, other speech models, or a native MLX implementation.

## Decision

Keep whisper.cpp and llama.cpp as the built-in defaults. Preserve the runnable
MLX experiment, raw outputs and [benchmark report](../reports/2026-10-03-mlx-runtime-evaluation/README.md).
Do not add a Python inference service or replace the installed models as part of
this evaluation. Do not change the application-overhead benchmark baseline.

Treat MLX speech as a promising candidate for a dedicated native integration
proposal. The 4-bit MLX candidate reduced warm speech latency by about 24–25%
(roughly 250–285 ms per clip) with slightly lower sampled process RSS than the
current Q5_0 model. FP16 was a little faster but used much more memory. The Python
candidate's process startup was slower. The speech result satisfies the initial
15% speed criterion; it does not satisfy the quality/integration evidence needed
to change the default.

Keep llama.cpp for the tested text setup: MLX did not produce a useful latency win
on short and uncached requests. A small reduction in long-request wall time came
with fewer output tokens and changed content. Both Qwen3-1.7B quantizations failed
some fidelity probes, so a smaller elapsed time alone cannot justify adoption.

## Why the speech result does not yet justify switching

- The corpus contains only three synthetic spoken clips. Both engines misheard
  Cantonese, and MLX changed some colloquial words. There is no demonstrated
  non-regression on real English/Cantonese/mixed dictation.
- The workers intentionally bypass the app's outer voice/hallucination guard.
  Both raw engines hallucinated on digital silence; an integration must preserve
  the existing early silence rejection and later transcript checks.
- Python timings establish feasibility, not a shippable Swift/C++/Rust binding.
  Cancellation, model loading/unloading, concurrent speech and polish memory,
  clean-machine packaging and recovery after failures are untested.
- Precision differs: Q5_0 vs MLX 4-bit/FP16, and Q4_K_M vs MLX 4-bit. The result
  applies to these complete configurations, not MLX versus C++ in the abstract.

## Reopen only with new evidence

Read this decision and reuse [the harness and fixtures](../../../benchmarks/runtime/README.md)
before proposing the same experiment. **Do not rerun this identical comparison
just because “MLX might be faster” comes up again.** The useful next steps are:

1. Add a consented, versioned corpus of real short and long dictations, covering
   English, Cantonese, natural code switching, names/numbers, accents, background
   noise and silence. Review WER/CER plus critical factual and language changes
   against the current engine; synthetic speed samples are insufficient.
2. Prototype the winning speech configuration through a native integration, keeping
   the existing guards. Measure cold and warm key-release-to-output latency,
   cancellation/unload/reload behavior, and whole-app peak memory with both models
   loaded. Retain the previously stated 15% repeatable latency-gain criterion and
   require no material quality or memory regression.
3. For a text migration, benchmark the default Qwen3-4B checkpoint and output quality
   first. Keep token counts, TTFT and cache behavior visible; do not equate shorter
   output with faster decoding.
4. A materially changed runtime, model, quantization or target Mac can justify a new
   dated comparison. Cite the changed input and this report; preserve the original
   evidence and revise this decision with a link to the successor decision.

The next investigation should close these gaps, rather than repeat the completed
M1 Pro synthetic benchmark or assume speech and text must use the same backend.
