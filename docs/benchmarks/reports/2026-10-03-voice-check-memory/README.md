# Reduce speech-check CPU and temporary memory

Every speech provider runs this guard before transcription. It previously decoded the entire
PCM recording into a floating-point vector, then cloned and sorted window levels to find the
noise floor. Decode directly per window and select the percentile in place instead.

## Provenance

- PR: [#57](https://github.com/sennett-lau/typelite/pull/57), stacked on waveform PR #56.
- Report date: 2026-10-03, Asia/Tokyo.
- Kind: performance improvement; same twenty-workload harness as the preceding report.
- Previous reference: [waveform work](../2026-10-03-waveform-work/README.md).
- Base: `4e733d0`, the waveform PR, with no production edits during before measurement.
- Machine: Apple M1 Pro, arm64, 8 logical CPUs, 32 GiB RAM, Darwin 25.5.0.
- Toolchain: Node v24.10.0; rustc 1.98.1; app release profile (size optimization, thin LTO, one codegen unit).
- Three fresh processes per version, five warmups and fifteen measured samples each.
- Raw data: [before](before.json), [after](after.json); full revisions, source hashes, harness,
  dependency/build hashes, environment and individual samples are retained. All comparison
  metadata other than revision/source/status/time matches.

## Change and hypothesis

The PCM bytes already contain everything needed for each window's energy. Avoiding the decoded
f64 vector removes eight temporary bytes per input sample and a second pass over those samples.
Window ordering is irrelevant to peak, noise percentile and voiced count, so in-place selection
replaces a sort and original-order clone. Thresholds and floating-point accumulation order stay
unchanged.

The frozen benchmark oracle compares every VoiceActivity field exactly, separately checking
odd trailing bytes, trimmed edges, partial windows, rates including zero, extreme sample values,
both level thresholds and the 180/200 ms voiced-duration boundary. Allocation counters run in
separate untimed calls; the reported bytes are allocator requests, not RSS or physical memory.

## Results

Candidate: `04df9f2`. UI rows are microseconds per batch; Rust rows are microseconds per
operation. Medians are medians of process medians; brackets contain pooled sample p10/p90.

| Workload | Before median [p10, p90] | After median [p10, p90] | Change | Saved |
|---|---:|---:|---:|---:|
| `ui/events/volume` | 5333.21 [4918.00, 5652.92] | 5233.50 [4888.75, 5715.17] | -1.9% | 99.71 |
| `ui/events/text` | 1948.54 [1889.25, 2082.54] | 1977.04 [1878.29, 2048.63] | +1.5% | -28.50 |
| `ui/recording/volume` | 5404.46 [5298.21, 5648.33] | 5578.04 [5260.33, 5652.92] | +3.2% | -173.58 |
| `ui/recording/text` | 2020.46 [1893.50, 2305.67] | 2091.33 [1902.42, 2208.79] | +3.5% | -70.88 |
| `ui/combined/volume` | 4992.79 [4881.29, 5280.17] | 5186.12 [4961.67, 5589.50] | +3.9% | -193.33 |
| `ui/combined/text` | 1891.79 [1875.37, 2014.42] | 1985.67 [1871.46, 2051.92] | +5.0% | -93.87 |
| `ui/waveform/silence` | 6825.50 [6545.08, 7278.17] | 6878.25 [6653.96, 7260.42] | +0.8% | -52.75 |
| `ui/waveform/voice-and-pauses` | 45126.92 [44037.42, 47266.71] | 44939.92 [44602.17, 45371.54] | -0.4% | 187.00 |
| `ui/waveform/hidden-resume` | 9857.33 [9648.96, 10327.92] | 10003.83 [9769.79, 11404.75] | +1.5% | -146.50 |
| `chinese/short` | 5.97 [5.66, 11.92] | 5.74 [5.69, 7.14] | -3.9% | 0.23 |
| `chinese/long` | 352.91 [345.60, 365.70] | 356.01 [348.77, 420.75] | +0.9% | -3.10 |
| `chinese/no-han` | 0.08 [0.08, 0.09] | 0.08 [0.08, 0.09] | +0.1% | -0.00 |
| `stream/short-small-writes` | 203.35 [178.19, 267.23] | 202.52 [177.66, 269.87] | -0.4% | 0.83 |
| `stream/long-batched` | 640.85 [610.25, 685.11] | 652.77 [618.05, 676.93] | +1.9% | -11.93 |
| `stream/stress-batched` | 2387.55 [2307.34, 2474.58] | 2349.67 [2317.65, 2399.57] | -1.6% | 37.89 |
| `voice/speech-4s` | 81.12 [80.56, 82.25] | 57.88 [56.97, 59.04] | -28.7% | 23.25 |
| `voice/speech-60s` | 1267.07 [1250.27, 1286.58] | 893.98 [886.40, 919.67] | -29.4% | 373.08 |
| `voice/speech-600s` | 12848.38 [12651.54, 13062.75] | 8943.92 [8848.12, 9112.96] | -30.4% | 3904.46 |
| `voice/quiet-4s` | 81.27 [80.70, 84.34] | 57.18 [56.80, 58.51] | -29.6% | 24.09 |
| `voice/silence-4s` | 76.65 [75.96, 77.67] | 54.00 [53.39, 55.29] | -29.6% | 22.66 |

All times and savings above are microseconds per operation or batch, as identified by the raw workload unit. Negative savings mean slower. Lower is better.

| Voice workload | Allocation calls, before to after | Peak live requested bytes, before to after |
|---|---:|---:|
| Speech, 4 seconds | 3 to 1 | 515,072 to 1,536 |
| Speech, 60 seconds | 4 to 1 | 7,751,808 to 23,936 |
| Speech, 600 seconds | 4 to 1 | 77,519,808 to 239,936 |
| Quiet speech, 4 seconds | 3 to 1 | 515,072 to 1,536 |
| Silence, 4 seconds | 3 to 1 | 515,072 to 1,536 |

Total requested bytes equal peak live requested bytes in these measured operations; all
allocation probes agreed across processes. The ten-minute case saves 3.90 ms of guard CPU
and 77,279,872 requested bytes (99.69%). This reduces a temporary memory spike immediately
before transcription; it does not change the model's own memory requirement. Short recordings
save roughly 23 microseconds and half a megabyte of requested temporary storage.

Target timing ranges do not overlap and every reference output matches exactly. Unchanged
UI/conversion/stream controls have overlapping ranges: their changes, including +5.0% for the
combined text probe, are inconclusive timing variation. Waveform trajectory/style counts and
subscription render counts remain identical.

## Validation and limitations

- The twelve focused voice tests pass, including generated spoken words at normal/low volume,
  room noise, key clicks, bumps, and level/duration/odd-byte boundary cases.
- Full Rust suite: 929 passed, one existing ignored test. Frontend: 699 passed across 70 files.
  TypeScript, ESLint, Prettier, cargo fmt, docs, language presets and baseline checks passed.
- Benchmark validation compares exact levels, duration, voiced duration and decisions against
  the frozen reference before timing. Independent production review found no blockers.
- Three fresh processes provide 45 measured samples per workload/version. The target gains
  exceed observed spread; no extra alternating run was needed. No concurrent builds/tests
  ran during timing, and release compilation is excluded.
- Allocation probes count Rust allocator requests in an untimed call, not RSS, retained heap,
  physical memory or model memory. The disabled tracking check is present in both timed builds.
- Synthetic PCM is deterministic and suitable for equivalence/performance, not speech-model
  accuracy evaluation. No claim about total dictation or inference latency is made.

## Reproduce

Use `4e733d0` for before and `04df9f2` for after. Both contain the same frozen harness.
With dependencies installed, run sequentially on the same idle machine using new paths:

```sh
npm run bench:local -- --out output/benchmarks/voice-before.json
# Switch to the candidate commit after the first command finishes.
npm run bench:local -- --out output/benchmarks/voice-after.json --compare output/benchmarks/voice-before.json
```

## Baseline decision

Promote the candidate: exact outputs and guard decisions are preserved while CPU and temporary
allocation both improve. This branch proposes a rolling baseline update, effective on the
default branch only when the PR merges.
