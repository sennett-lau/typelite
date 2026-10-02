# Local performance results

Recording events unnecessarily rerendered their host components, streamed responses repeatedly
copied their buffers, and Cantonese conversion rebuilt a fixed word list during processing.
This first report establishes the measurement suite and records three focused improvements.

Measured on 2026-10-03 (Japan time), on an Apple M1 Pro with 32 GiB RAM, macOS (Darwin 25.5.0),
Node 24.10.0 and Rust 1.98.1. Rust used the application's release profile (`opt-level=s`, thin
LTO, one codegen unit). UI measurements used React development mode in jsdom.

The baseline was captured at revision `893c832` before any production changes. Only the new
benchmark harness, package/Cargo benchmark entries and documentation existed then; `git diff
--exit-code -- src src-tauri/src` passed before measuring. All comparison runs use the same
harness, fixtures, dependencies and build settings.

Each run uses three fresh processes per suite, five warmup samples and fifteen measured samples
per workload per process. Tables report the median of the three process medians. The JSON
files retain all 45 samples and p10/p90 summaries, plus source and executable hashes. The UI
workloads count events without sleeping between them.

## Provenance

| Field | Value |
|---|---|
| Kind | Initial performance improvement and first rolling baseline. |
| PR | Initial working-tree change; a PR has not been opened yet. |
| Previous rolling baseline | None; [before.json](before.json) records the unmodified production code. |
| Before source SHA-256 | `5b4e45c2ab423484be56a3a8816ef619c74dabc2cbc0c352f6cfb341c3b96f29` |
| After source SHA-256 | `acf2ad8ba13c346cec3121d211eb83c9af845c1a114c36d4129b10e3c3171dc1` |
| Harness SHA-256 | `66f6fa18efba39f768713811754e084143d761b91c98c1922a42bf2e0853db4b` |
| Dependencies and build | Matching hashes in both raw snapshots. |

Both snapshots have the same Git HEAD; the source hashes identify the before and after trees.
The raw files were moved here without changing their contents when the reporting workflow was
introduced. Their original output paths and working-tree statuses remain historical metadata.

## Final comparison

These medians compare the untouched baseline with [the final snapshot](after.json).
The earlier incremental measurements below are separate runs.

| Workload | Before | After | Interpretation |
|---|---:|---:|---|
| Microphone updates, combined hook probe | 333 renders; 6.630 ms/batch | 0 renders; 5.092 ms/batch | Unrelated renders eliminated; proxy time reduced 23.2%. |
| Text chunks, combined hook probe | 128 renders; 2.564 ms/batch | 0 renders; 1.952 ms/batch | Unrelated renders eliminated; proxy time reduced 23.9%. |
| Long streamed response | 1.759 ms/request | 0.635 ms/request | Local overhead reduced 63.9%. |
| Batched streaming stress case | 34.329 ms/request | 2.331 ms/request | Local overhead reduced 93.2%. |
| Short streamed response | 0.244 ms/request | 0.209 ms/request | Inconclusive; distributions overlap. |
| Long Cantonese conversion | 402.78 µs/conversion | 357.04 µs/conversion | Time reduced 11.4%; modest absolute saving. |
| Short Cantonese conversion | 6.61 µs/conversion | 5.71 µs/conversion | Initial process variation; see alternating confirmation below. |
| English conversion control | 0.08 µs/conversion | 0.08 µs/conversion | Unchanged within noise. |

The final long-stream p10/p90 range is 0.593–0.802 ms, versus 1.681–1.866 ms before. For
the streaming stress case those ranges are 2.244–2.414 ms and 33.284–35.315 ms. Long conversion
ranges are 348.16–390.17 µs and 396.35–415.96 µs. Short conversion's initial ranges overlap
substantially, and its first process regressed; its initial aggregate alone is weak evidence.

## Incremental measurements

| Snapshot | Production changes | Evidence |
|---|---|---|
| Baseline | None | [Raw baseline](before.json) |
| UI subscriptions | Event bridge reads actions without subscribing; recording hook selects its own state. | [After UI](after-ui.json) |
| Stream decoding | UI changes plus a reusable byte buffer; complete lines are decoded without copying each remaining suffix. | [After streaming](after-stream.json) |
| Cantonese conversion | Earlier changes plus static character slices for the fixed protected-word list. | [After conversion](after.json) |

In the first increment, each microphone probe went from **333 to zero unrelated renders**;
each text probe went from **128 to zero**. The combined probe's median microphone batch fell
from 6.630 ms to 5.262 ms (20.6%), and its text batch from 2.564 ms to 2.008 ms (21.7%).
Recording-state changes still rerender the probe, event outputs remain correct, listener
registrations stay constant, and cleanup removes every listener.

In the streaming increment, the long fixture fell from 1.759 ms to 0.626 ms (64.4%) and the
stress fixture from 34.329 ms to 2.305 ms (93.3%). The short fixture fell from 0.244 ms to
0.218 ms, but its p10/p90 ranges overlap substantially; that small timing difference is
inconclusive. The same benchmark verifies final text and streamed callbacks, including the
final-period rule. Separate unit tests exercise every byte split of CJK/emoji text and preserve
replacement characters for genuinely malformed UTF-8.

## Alternating confirmation

After the final increment, the retained release executables were run in order **before, after,
after, before, before, after**, with no rebuilds or concurrent tests. Each fresh process used
the same warmups and measured samples. Executable hashes were verified before execution.
[Raw alternating results](interleaved.json) include all samples and both binary hashes.

| Rust workload | Before median | After median | Reduction |
|---|---:|---:|---:|
| Long streaming | 1.785 ms | 0.644 ms | 63.9% |
| Streaming stress | 34.756 ms | 2.315 ms | 93.3% |
| Long conversion | 405.64 µs | 356.81 µs | 12.0% |
| Short conversion | 6.53 µs | 5.78 µs | 11.5% |

All three alternating short-conversion process medians were 6.52–6.60 µs before and 5.73–5.79 µs
after, supporting a small benefit despite the initial startup variation. The unchanged English
control remained 0.08 µs. Short streaming changed only 4.1% in this confirmation, reinforcing
that its apparent speedup is inconclusive.

The conversion change is retained because the long-input gain is repeatable and replacing fixed
per-character temporary vectors with static data keeps the matching algorithm unchanged.

## Validation

- Frontend: 731 tests across 70 files passed, including the new render-subscription regressions.
- Rust: 962 tests passed and one test was ignored, including byte-boundary decoding and protected
  Cantonese-word regressions.
- TypeScript/build, ESLint, Rust/TypeScript formatting, docs and preset checks passed. The
  production build still reports bundle-size and mixed static/dynamic-import warnings, plus a
  plugin-timing warning; bundle splitting was outside these measured changes.
- The opt-in benchmark suite validated all fixture outputs and retained the same harness hash
  throughout. No external models, microphone recording or real-server inference tests were run.

The plan and harness received independent agent review before the baseline. Follow-up review
checked the production changes and the scope of the performance claims.

## Interpretation

Render counts are the strongest UI evidence. Timing includes React testing infrastructure and
does not predict WKWebView rendering time, power consumption or full-window savings.

Stream timings include prompt building, loopback HTTP, decoding, callbacks and final-period
cleanup. They measure application overhead with immediately available responses, not network
or model generation latency. The batched stress workload highlights a scaling issue and is not
a claim about typical dictation latency.

Chinese conversion includes warm OpenCC and the Cantonese adjustments. The long fixture repeats
a short sentence 64 times. Its frequency of 系/繫 makes it useful for examining that adjustment,
but improvements will vary with ordinary speech. English-only conversion is a control.

See [the benchmark guide](../../README.md) for commands and measurement boundaries.

## Reproduce

The original measurements used these commands, with results subsequently archived under the
names linked above:

```sh
npm run bench:local -- --out benchmarks/results/baseline.json
npm run bench:local -- --out benchmarks/results/after-ui.json --compare benchmarks/results/baseline.json
npm run bench:local -- --out benchmarks/results/after-stream.json --compare benchmarks/results/baseline.json
npm run bench:local -- --out benchmarks/results/after-conversion.json --compare benchmarks/results/baseline.json
```

The same newly added harness was present on the unmodified production tree and on each candidate.
The before tree is revision `893c832`; the candidate was a working-tree diff, identified by its
source hash above. Future repetitions should write a new report directory rather than overwrite
these measurements. The archived interleaved JSON records executable hashes and execution order.

## Baseline decision

Use [after.json](after.json) as the first rolling reference. The long streaming and conversion
gains repeated in alternating runs, unnecessary UI renders were eliminated, and correctness
checks passed. Preserve the original and intermediate measurements as history. This proposed
baseline becomes the shared reference when the performance change merges.
