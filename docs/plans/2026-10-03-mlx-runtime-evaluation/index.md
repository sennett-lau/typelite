# Evaluate MLX inference on Apple silicon

Compare MLX with Typelite's existing GPU inference paths on the same Mac before
changing the shipping runtime. Keep the experiment and its decision discoverable,
including a decision to retain the current engines.

## Status

Done — 2026-10-03. The experiment is complete; adopting a shipping MLX backend is
deferred in the [recorded decision](../../benchmarks/decisions/2026-10-03-mlx-runtime.md).

## Goals and non-goals

- Measure real inference for speech recognition and text polishing, with raw
  samples, output text, model revisions, runtime versions and reproduction commands.
- Use the installed Whisper large-v3-turbo and the supported Qwen3-1.7B model.
- Separate startup, first inference and warm inference. Compare identical inputs
  with greedy decoding and explicitly describe quantization differences.
- Evaluate English, Cantonese and silence for speech; short and long dictation for
  polishing. Synthetic speech is a feasibility check, not a real-world accuracy corpus.
- Do not change the shipping backend or promote these measurements into the
  unrelated local-overhead baseline without evidence supporting the change.

## Key decisions

- Use the public production `LocalWhisper` path and the bundled llama-server as
  baselines. Both already use Metal; a CPU baseline would misrepresent the app.
- Prototype MLX in an isolated Python environment. A successful prototype would
  still need native integration, cancellation, packaging and lifecycle validation.
- Run engines sequentially, with three fresh processes per engine and five warm
  samples per workload. Keep first-call measurements separate and reverse engine
  order between rounds. Do not run builds or tests during timed inference.
- Record output correctness alongside latency. A repeatable improvement of at
  least 15% in relevant warm workloads, without material correctness or memory
  regressions, justifies a separate integration proposal; it does not authorize
  silently changing the default based on synthetic samples alone.
- Disk space limits this first pass to the smaller supported Qwen model. Download
  candidates sequentially; never remove the user's installed model or caches.

## Parts

| Part | Purpose |
| --- | --- |
| [Evaluation report](../../benchmarks/reports/2026-10-03-mlx-runtime-evaluation/README.md) | Measurements, decision and conditions for revisiting it |

## Open questions

- Resolved: MLX 4-bit improves warm inference on the synthetic speech clips by
  about 24–25%; this is not a whole-app latency claim. The text prototype has no
  demonstrated quality-preserving performance advantage.
- Deferred to a separate proposal: native speech integration and a real speech
  corpus. The measured warm speech gain justifies that investigation, while
  startup, fidelity and lifecycle evidence are insufficient for changing defaults.
- Untested: the default 4B text model, other Macs, long/noisy real speech and both
  engines loaded concurrently. Do not generalize the smaller-model experiment.
