# Reduce speech-check temporary memory

Analyze PCM windows directly and select the noise-floor percentile in place, preserving the
existing silence guard while avoiding a full recording of decoded floating-point samples.

Status: done — 2026-10-03.

## Goals and non-goals

- Reduce CPU time and requested temporary allocation bytes for short and long recordings.
- Preserve every VoiceActivity output field, including odd-byte tails, trimmed edges, complete
  windows, sample-rate handling and speech/quiet/click decisions.
- Keep all thresholds and model inference behavior unchanged. This is not a recognition-quality
  experiment or a claim about process RSS.

## Key decisions

- Decode each little-endian i16 directly while accumulating its window energy: a recording-wide
  f64 buffer is unnecessary because only window levels are consumed.
- Find the tenth-percentile noise level in place, then count qualifying windows: order is
  irrelevant, so a sorted buffer and an original-order clone are unnecessary.
- Use the frozen reference and allocation probes established in the waveform PR. Capture a
  fresh before run on that PR before changing production code.
- Keep this as a separate PR so the audio guard can be reviewed independently of UI changes.

## Parts

| File | Purpose |
|---|---|
| [Benchmark methodology](../../benchmarks/methodology.md) | Timing, output-equivalence and allocation boundaries |
| [Waveform foundation](../2026-10-03-waveform-work/index.md) | Preceding PR that introduced the frozen speech-check benchmark |

## Open questions

None. The [report](../../benchmarks/reports/2026-10-03-voice-check-memory/README.md)
records exact output equivalence, CPU reductions and requested-allocation savings.

## Considered

A C++ inference port is unrelated to this measured application-side cost and is not included.
