# Reduce waveform frame work

The recording waveform used to set both styles on all eighteen bars every frame, even when
nothing visible changed. It also subtracted one history interval at a time after a hidden
window resumed. Cache the exact formatted styles and bound catch-up to one full history.

## Provenance

- Report date: 2026-10-03, Asia/Tokyo.
- Kind: performance improvement and suite baseline reset. Three waveform and five speech-check
  workloads were added before production changes; existing workloads remain as controls.
- Previous reference: [local overhead](../2026-10-03-local-overhead/README.md).
- Base: test-cleanup commit `95bd25a`, with benchmark-only commit `8f98fc9` applied before timing.
- Hardware: Apple M1 Pro, arm64, 8 logical CPUs, 32 GiB RAM, Darwin 25.5.0.
- Toolchain: Node v24.10.0; rustc 1.98.1; app release profile (size optimization, thin LTO, one codegen unit).
- Three fresh processes, five warmups and fifteen measured samples per workload/process.
- Raw data: [before](before.json), [after](after.json). Both include full revisions, source,
  harness, dependency/build hashes, environment, individual samples and working-tree status.
  Harness, dependency/build hashes and environment must match for comparison.

## Change and hypothesis

The cache compares emitted strings after the existing `toFixed` formatting, preserving rounding.
It resets with the animation effect, including reduced-motion changes. Missed history samples
all receive the same current level, so at most eighteen pushes reproduce the same history.
Integer interval calculation replaces the potentially unbounded subtraction loop.

The benchmark drives the actual component using a controlled clock and synthetic volume. A
separate untimed pass hashes all eighteen bars after every frame. All trajectory hashes must
match exactly between before and after, not only the final image. DOM counters call the real
setters and add identical instrumentation overhead to both versions.

Speech-check fixtures and allocation tracking establish the next PR's foundation. There is no
speech-check production change here. A C++ runtime port has no measured justification for
these application-owned costs.

## Results

Candidate: `41dc2ae`. All UI rows are microseconds per batch; all Rust rows are microseconds
per operation. Medians are medians of process medians; brackets contain pooled sample p10/p90.

| Workload | Before median [p10, p90] | After median [p10, p90] | Change | Saved |
|---|---:|---:|---:|---:|
| `ui/events/volume` | 5276.13 [4932.83, 5585.87] | 5260.42 [4997.79, 5596.50] | -0.3% | 15.71 |
| `ui/events/text` | 1898.87 [1875.79, 2165.88] | 2000.42 [1881.75, 2104.96] | +5.3% | -101.54 |
| `ui/recording/volume` | 5393.37 [5261.88, 5605.58] | 5451.29 [5242.50, 5720.46] | +1.1% | -57.92 |
| `ui/recording/text` | 2010.71 [1887.67, 2093.58] | 1968.46 [1900.21, 2160.92] | -2.1% | 42.25 |
| `ui/combined/volume` | 4965.42 [4893.00, 5155.12] | 4999.54 [4869.42, 5174.38] | +0.7% | -34.13 |
| `ui/combined/text` | 1894.25 [1870.75, 2034.79] | 1897.67 [1866.21, 1988.92] | +0.2% | -3.42 |
| `ui/waveform/silence` | 35340.12 [34940.50, 36607.54] | 6657.79 [6518.33, 7263.42] | -81.2% | 28682.33 |
| `ui/waveform/voice-and-pauses` | 54000.54 [52702.92, 55676.71] | 44402.87 [43616.67, 47168.29] | -17.8% | 9597.67 |
| `ui/waveform/hidden-resume` | 32369.58 [31615.87, 33887.83] | 9996.46 [9637.42, 10352.04] | -69.1% | 22373.13 |
| `chinese/short` | 5.80 [5.65, 12.06] | 5.75 [5.62, 7.51] | -0.9% | 0.05 |
| `chinese/long` | 352.92 [347.00, 366.54] | 350.36 [345.41, 367.40] | -0.7% | 2.56 |
| `chinese/no-han` | 0.08 [0.07, 0.08] | 0.08 [0.08, 0.09] | +0.5% | -0.00 |
| `stream/short-small-writes` | 212.78 [182.99, 268.34] | 212.10 [184.77, 269.87] | -0.3% | 0.68 |
| `stream/long-batched` | 637.55 [611.54, 667.33] | 651.29 [615.59, 731.72] | +2.2% | -13.74 |
| `stream/stress-batched` | 2380.62 [2321.33, 2461.21] | 2323.35 [2290.91, 2383.73] | -2.4% | 57.27 |
| `voice/speech-4s` | 80.57 [79.99, 83.27] | 81.28 [80.52, 83.14] | +0.9% | -0.71 |
| `voice/speech-60s` | 1259.26 [1248.93, 1279.50] | 1266.66 [1258.32, 1284.72] | +0.6% | -7.40 |
| `voice/speech-600s` | 12936.88 [12708.17, 13156.50] | 12857.75 [12727.29, 13116.29] | -0.6% | 79.12 |
| `voice/quiet-4s` | 80.88 [80.37, 82.60] | 81.90 [80.64, 82.74] | +1.3% | -1.02 |
| `voice/silence-4s` | 76.06 [75.26, 77.90] | 76.20 [75.65, 76.91] | +0.2% | -0.14 |

All times and savings above are microseconds per operation or batch, as identified by the raw workload unit. Negative savings mean slower. Lower is better.


| Waveform case | Transform writes, before → after | Opacity writes, before → after |
|---|---:|---:|
| Silence, 600 frames | 10,800 → 0 | 10,800 → 0 |
| Voice and pauses, 600 frames | 10,800 → 8,630 | 10,800 → 6,056 |
| Hidden resume, 121 frames | 2,178 → 1,875 | 2,178 → 1,433 |

Counts were identical in every sample/process. Trajectory hashes matched exactly. The silence
batch saves 28.68 ms of component CPU work, speech/pauses 9.60 ms, and hidden resume 22.37 ms.
These gains are well beyond measured sample spread. Unchanged controls have overlapping ranges;
including the +5.3% event-text change, they are noise/inconclusive, not claimed speedups or
accepted functional regressions. All six subscription probes retain zero unrelated renders.
Voice outputs and allocation counts remain unchanged.

## Validation and limitations

- Five component tests cover silence, known speech progression, settling, parent rerenders,
  fractional sampling boundaries, long resume, reduced-motion changes and animation cleanup.
- Full Rust suite: 928 passed, one existing ignored test. Full frontend suite: 699 passed across 70 files. TypeScript, ESLint, Prettier, Rust formatting,
  documentation, language-preset and generated-baseline checks passed.
- Nineteen in-memory benchmark-validator cases checked malformed counts, missing workloads,
  changed outputs and permissible allocation changes; the old archived baseline still validates.
- No concurrent builds/tests ran during timing. Three fresh processes provide 45 samples per
  workload. No extra alternating run was needed for these large, non-overlapping target gains.
- React development/jsdom timings include counter overhead and exclude mounting/initialization.
  No native WebKit, GPU, microphone, model-inference, battery or total-dictation claims follow.
- New workload instrumentation resets comparison with the earlier twelve-workload reference.
  Before and after in this report use the same extended harness and environment.

## Reproduce

Use commit `8f98fc9` for before and `41dc2ae` for after. Both contain the same harness.
Run sequentially on the same idle machine, with dependencies installed. Use fresh output paths
so the archived evidence remains immutable:

```sh
npm run bench:local -- --out output/benchmarks/waveform-before.json
# Switch to the candidate commit after the first command finishes.
npm run bench:local -- --out output/benchmarks/waveform-after.json --compare output/benchmarks/waveform-before.json
```

## Baseline decision

Promote this candidate: it eliminates redundant writes and bounds hidden-window catch-up while
preserving every observed animation frame. The branch proposes the next baseline; the shared
default-branch reference advances only when the PR merges.
