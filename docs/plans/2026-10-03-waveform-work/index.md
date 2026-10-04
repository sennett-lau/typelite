# Reduce waveform frame work

Keep the capsule's existing waveform appearance and motion while avoiding repeated
DOM writes for unchanged bar styles and unbounded catch-up work after a hidden
window resumes. Extend the benchmark foundation before changing the component.

Status: done — 2026-10-03.

## Goals and non-goals

- Measure the actual Waveform component with deterministic animation timestamps
  and volume inputs: silence, changing speech levels and a long hidden interval.
- Preserve formatted transforms/opacity, smoothing, history, reduced-motion
  behavior and animation cleanup. Capture visual state outside timed samples.
- Report DOM setter counts alongside CPU time; jsdom timing is a proxy, not
  native WebKit rendering, frame rate or battery consumption.
- Keep inference runtimes and waveform styling unchanged.

## Key decisions

- Compare the final formatted style strings before writing them; this preserves
  the existing rounding and avoids work when the visible value is unchanged.
- Bound history catch-up by its capacity; once all bars hold the same level,
  replaying additional missed samples adds no useful history.
- Capture a fresh before run with the extended harness before production edits.
  Preserve existing workload IDs and report all controls, including regressions.
- Add voice-check workloads as benchmark foundation for the next separate Rust
  optimization, without changing the voice check in this PR.
- Keep waveform, speech-check allocation and dictionary changes in separate PRs
  stacked from the test-cleanup branch so each can be reviewed independently.

## Parts

| File | Purpose |
|---|---|
| [Existing waveform design](../2026-09-24-v1-scope/capsule-waveform.md) | Appearance and motion requirements |
| [Benchmark methodology](../../benchmarks/methodology.md) | Shared timing and provenance rules |

## Open questions

None. The [measured report](../../benchmarks/reports/2026-10-03-waveform-work/README.md)
records the gains and identical complete animation trajectories.

## Considered

A C++ inference rewrite is not proposed. The identified costs are in application
UI and Rust processing, and no measured inference-kernel bottleneck justifies a port.
