# Reduce dictionary editing and transfer work

Adding an entry used to reevaluate the entire visible dictionary on every keystroke. Import
prepared an identical SQL statement for each accepted row, and export cloned strings into a
JSON value tree. Isolate the Add form state, reuse statements lazily within the transaction,
and serialize borrowed views in the existing JSON field order.

## Provenance

- PR: [#58](https://github.com/sennett-lau/typelite/pull/58), stacked on speech-check PR #57.
- Report date: 2026-10-03, Asia/Tokyo.
- Kind: performance improvement and suite baseline reset. Two dictionary UI workloads and
  thirteen transfer workloads were added; all twenty existing workloads remain as controls.
- Previous reference: [speech-check memory](../2026-10-03-voice-check-memory/README.md).
- Base: speech-check PR #57 at `3521138`, plus benchmark-only commit `3174f91` before timing.
- Machine: Apple M1 Pro, arm64, 8 logical CPUs, 32 GiB RAM, Darwin 25.5.0.
- Toolchain: Node v24.10.0; rustc 1.98.1; app release profile (size optimization, thin LTO, one codegen unit).
- Three fresh processes per version; five warmups and fifteen measured samples per workload.
- Raw snapshots: [before](before.json), [storage step](backend-after.json), [final after](after.json).
  Each contains full revision/source hashes, matching harness/dependency/build/environment
  metadata, working-tree status and all samples. The storage step is measured before UI edits.

## Change and hypothesis

A single always-mounted Add-form child owns all four drafts and displays only the active form.
Changing a field then has no reason to render the sibling list. Keeping the child mounted also
preserves drafts across Words/Corrections switches without adding hidden form fields.

Import creates an INSERT statement only after the first unique row of its kind passes duplicate
checks, then reuses it. Empty/all-duplicate imports therefore avoid added statement preparation.
The existing transaction, Unicode identities, reports and rollback semantics stay in place.
Borrowed export views preserve exact pretty-JSON bytes, including field order, escaping, null
pronunciations and disabled corrections, while avoiding owned string/value-tree clones.

The benchmark drives the real pane and checks every displayed row, input value and draft switch.
Row-label counters are calibrated at mount; each row evaluates the edit label twice. They measure
row evaluation work rather than DOM mutations. Transfer fixtures use temporary WAL databases,
with setup/seeding/read-back/cleanup outside timing and JSON parse plus commit inside timing.

## Results

Storage candidate: `b879ded`; final UI candidate: `336b3e8`. UI rows are microseconds per batch;
Rust rows are microseconds per operation. Brackets show pooled sample p10/p90. Lower is better.

| Workload | Before median [p10, p90] | After median [p10, p90] | Change | Saved |
|---|---:|---:|---:|---:|
| `ui/events/volume` | 5402.46 [4959.54, 5857.50] | 5252.00 [5017.12, 6018.83] | -2.8% | 150.46 |
| `ui/events/text` | 1927.67 [1886.87, 1979.87] | 1999.13 [1878.67, 2059.83] | +3.7% | -71.46 |
| `ui/recording/volume` | 5475.17 [5307.58, 5685.79] | 5633.71 [5300.42, 5829.00] | +2.9% | -158.54 |
| `ui/recording/text` | 2040.96 [1918.83, 2146.79] | 2009.42 [1900.58, 2196.08] | -1.5% | 31.54 |
| `ui/combined/volume` | 5036.25 [4920.62, 5176.75] | 5139.00 [4887.54, 5257.04] | +2.0% | -102.75 |
| `ui/combined/text` | 1918.92 [1869.96, 1995.13] | 1963.87 [1898.79, 2018.04] | +2.3% | -44.96 |
| `ui/waveform/silence` | 6670.42 [6541.87, 7254.83] | 6855.96 [6571.58, 7443.00] | +2.8% | -185.54 |
| `ui/waveform/voice-and-pauses` | 44379.17 [43631.29, 44843.46] | 44874.50 [44633.50, 46031.50] | +1.1% | -495.33 |
| `ui/waveform/hidden-resume` | 9622.37 [9521.37, 10237.54] | 9877.29 [9734.38, 10421.50] | +2.6% | -254.92 |
| `ui/dictionary/add-words` | 1876161.42 [1805905.71, 1907667.54] | 5247.96 [2780.13, 5932.92] | -99.7% | 1870913.46 |
| `ui/dictionary/add-corrections` | 2130908.13 [2109872.63, 2177351.54] | 2615.62 [2302.54, 5227.37] | -99.9% | 2128292.50 |
| `chinese/short` | 5.73 [5.59, 5.80] | 5.83 [5.71, 6.04] | +1.8% | -0.10 |
| `chinese/long` | 355.52 [348.73, 363.79] | 353.17 [344.69, 368.82] | -0.7% | 2.35 |
| `chinese/no-han` | 0.08 [0.08, 0.09] | 0.08 [0.08, 0.08] | -1.7% | 0.00 |
| `stream/short-small-writes` | 185.70 [168.18, 264.88] | 205.32 [177.72, 262.28] | +10.6% | -19.61 |
| `stream/long-batched` | 664.61 [615.90, 700.94] | 660.22 [619.04, 687.03] | -0.7% | 4.39 |
| `stream/stress-batched` | 2364.90 [2339.84, 2399.89] | 2336.95 [2320.31, 2370.55] | -1.2% | 27.95 |
| `voice/speech-4s` | 57.40 [56.94, 58.03] | 57.07 [56.62, 57.63] | -0.6% | 0.33 |
| `voice/speech-60s` | 895.15 [881.40, 915.43] | 896.35 [885.22, 914.88] | +0.1% | -1.20 |
| `voice/speech-600s` | 8925.62 [8851.92, 9103.67] | 8962.12 [8848.25, 9175.83] | +0.4% | -36.50 |
| `voice/quiet-4s` | 57.43 [56.59, 58.25] | 57.24 [56.55, 58.33] | -0.3% | 0.19 |
| `voice/silence-4s` | 53.95 [53.35, 54.97] | 53.89 [53.26, 54.84] | -0.1% | 0.06 |
| `dictionary/export-json-0` | 0.49 [0.48, 0.51] | 0.19 [0.19, 0.20] | -60.9% | 0.30 |
| `dictionary/import-json-0` | 8.58 [7.67, 10.83] | 9.79 [7.71, 12.96] | +14.1% | -1.21 |
| `dictionary/export-json-2` | 1.94 [1.90, 1.96] | 0.67 [0.67, 0.74] | -65.2% | 1.26 |
| `dictionary/import-json-2` | 129.75 [106.21, 146.88] | 127.33 [106.38, 152.38] | -1.9% | 2.42 |
| `dictionary/import-json-2-100pct-duplicates` | 14.33 [12.83, 19.71] | 13.92 [13.12, 18.67] | -2.9% | 0.42 |
| `dictionary/export-json-20` | 12.63 [12.37, 12.93] | 3.37 [3.35, 3.48] | -73.3% | 9.26 |
| `dictionary/import-json-20` | 174.75 [154.04, 196.17] | 141.33 [125.08, 216.46] | -19.1% | 33.42 |
| `dictionary/export-json-1000` | 579.55 [568.80, 591.80] | 145.30 [139.92, 149.97] | -74.9% | 434.25 |
| `dictionary/import-json-1000` | 2805.00 [2702.96, 2988.17] | 1902.79 [1727.00, 2038.33] | -32.2% | 902.21 |
| `dictionary/export-json-10000` | 5892.00 [5767.46, 5974.33] | 1407.50 [1372.71, 1462.96] | -76.1% | 4484.50 |
| `dictionary/import-json-10000` | 27173.75 [26448.96, 28048.62] | 16165.50 [15557.33, 17051.58] | -40.5% | 11008.25 |
| `dictionary/import-json-10000-100pct-duplicates` | 12091.33 [11819.62, 12425.25] | 12270.75 [11931.29, 12559.08] | +1.5% | -179.42 |
| `dictionary/import-json-10000-90pct-duplicates` | 14020.21 [13607.46, 14401.17] | 12762.54 [12471.08, 13201.54] | -9.0% | 1257.67 |

All times and savings above are microseconds per operation or batch, as identified by the raw workload unit. Negative savings mean slower. Lower is better.


### Attribution by step

| Workload (milliseconds) | Before | Storage only | Final |
|---|---:|---:|---:|
| `ui/dictionary/add-words` | 1876.161 | 1854.110 | 5.248 |
| `ui/dictionary/add-corrections` | 2130.908 | 2155.316 | 2.616 |
| `dictionary/export-json-10000` | 5.892 | 1.408 | 1.407 |
| `dictionary/import-json-10000` | 27.174 | 16.292 | 16.166 |

Both UI cases evaluate 24,000 rows (48,000 edit-label calls) before and after the storage-only
step, then zero after form-state isolation. Counts agree in every sample/process. All row
snapshots and final draft values match. The word batch saves 1,870.91 ms; corrections save
2,128.29 ms. These are actual-pane development/jsdom measurements, not native input latency.

The storage step already supplies the transfer gains: 10,000-row export falls from 5.892 ms
to 1.408 ms and import from 27.174 ms to 16.292 ms. The final Rust executable is byte-identical
to the storage-step executable; small later Rust differences therefore come from measurement
conditions, not the UI implementation. Export improvement is consistent at every size. Large
imports improve clearly; tiny import timings overlap and are inconclusive. Partial-duplicate
imports improve about 9%, while all-duplicate timings overlap.

Unchanged subscription, waveform, conversion, stream and voice controls have overlapping
ranges. The short-stream +10.6% median change is within its broad spread and is not evidence of
a code regression. All waveform trajectories/style counts, subscription render counts and
voice outputs/allocations remain identical. Empty-import timing prompted the supplemental
alternating confirmation below: its final median rose 1.21 microseconds (+14.1%) despite
overlapping ranges and no additional statement preparation.

### Alternating confirmation

The [supplemental raw results](confirmation.json) retain all Rust workloads from six fresh
processes in `before, after, after, before, before, after` order. The exact saved executables
were checked by hash; no rebuild or frontend work ran between them. Each process still uses
five warmups and fifteen measured samples. All numbers below are microseconds per operation.

| Workload | Before median [p10, p90] | After median [p10, p90] | Change |
|---|---:|---:|---:|
| `chinese/short` | 5.66 [5.59, 6.02] | 5.68 [5.60, 5.92] | +0.3% |
| `chinese/long` | 352.57 [346.18, 364.55] | 357.06 [346.74, 360.41] | +1.3% |
| `chinese/no-han` | 0.07 [0.07, 0.08] | 0.08 [0.08, 0.09] | +12.2% |
| `stream/short-small-writes` | 204.25 [181.72, 271.30] | 201.13 [186.64, 264.22] | -1.5% |
| `stream/long-batched` | 655.34 [617.91, 691.59] | 643.78 [609.04, 680.76] | -1.8% |
| `stream/stress-batched` | 2339.54 [2295.20, 2383.67] | 2334.60 [2301.71, 2398.56] | -0.2% |
| `voice/speech-4s` | 56.84 [56.45, 58.65] | 57.02 [56.46, 58.36] | +0.3% |
| `voice/speech-60s` | 883.98 [877.66, 901.70] | 886.80 [879.53, 903.91] | +0.3% |
| `voice/speech-600s` | 8891.08 [8778.50, 9021.29] | 8884.79 [8811.71, 9015.25] | -0.1% |
| `voice/quiet-4s` | 57.07 [56.63, 57.88] | 57.03 [56.54, 57.86] | -0.1% |
| `voice/silence-4s` | 53.99 [53.34, 54.79] | 53.54 [53.13, 53.99] | -0.8% |
| `dictionary/export-json-0` | 0.49 [0.48, 0.54] | 0.19 [0.19, 0.19] | -61.7% |
| `dictionary/import-json-0` | 9.38 [8.00, 12.29] | 8.21 [7.71, 11.58] | -12.4% |
| `dictionary/export-json-2` | 1.90 [1.89, 1.98] | 0.66 [0.66, 0.69] | -65.0% |
| `dictionary/import-json-2` | 105.17 [93.92, 123.63] | 145.62 [112.08, 214.88] | +38.5% |
| `dictionary/import-json-2-100pct-duplicates` | 14.04 [12.96, 17.00] | 17.83 [14.21, 25.29] | +27.0% |
| `dictionary/export-json-20` | 12.57 [12.37, 12.89] | 3.39 [3.29, 3.50] | -73.0% |
| `dictionary/import-json-20` | 204.21 [151.42, 228.50] | 146.96 [130.92, 239.92] | -28.0% |
| `dictionary/export-json-1000` | 568.35 [561.56, 595.07] | 140.22 [139.19, 148.81] | -75.3% |
| `dictionary/import-json-1000` | 2885.00 [2798.08, 2990.96] | 2052.75 [1692.79, 2144.58] | -28.8% |
| `dictionary/export-json-10000` | 5864.67 [5720.71, 6093.29] | 1390.25 [1379.83, 1435.08] | -76.3% |
| `dictionary/import-json-10000` | 27360.00 [26146.75, 28338.96] | 16064.96 [14267.46, 17069.33] | -41.3% |
| `dictionary/import-json-10000-100pct-duplicates` | 12030.75 [11650.50, 12257.50] | 12067.08 [11723.83, 12350.50] | +0.3% |
| `dictionary/import-json-10000-90pct-duplicates` | 13756.17 [13452.83, 14186.83] | 12883.08 [12470.75, 13280.00] | -6.3% |

Large-file export/import gains repeat. The empty-import median reverses direction (9.38 to
8.21 microseconds), so its primary-run slowdown is not stable. Tiny imports remain mixed: the
two-row case rises 40.46 microseconds and its duplicate-only case rises 3.79 microseconds here,
while the primary comparison showed -1.9% and -2.9%, respectively. No tiny-import speedup is
claimed, and the possible small absolute overhead is accepted for the clear large-file/UI
gains. The unchanged English-only control varies about 0.009 microseconds; this nanosecond-scale
result does not support a practical speed claim. These supplemental results are retained alongside the primary comparison.

## Validation and limitations

- Full Rust suite: 930 passed, one existing ignored test. Frontend: 706 passed in 70 files.
  TypeScript, ESLint, Prettier, Rust formatting, docs, presets and baseline checks passed.
- Nine dictionary I/O tests include exact export bytes, repeated/interleaved statement use,
  Unicode duplicate identities, null pronunciation, disabled rules and transaction rollback
  after both row kinds were inserted while preserving pre-existing rows.
- Fourteen actual-pane tests cover drafts across sections, trimming/validation, successful
  refresh, failed-add draft retention, pending submission during tab switches, refresh errors,
  search, editing and import/export behavior. They now use the real store so refreshed rows
  are checked as displayed behavior rather than mocked setter calls.
- Independent plan, benchmark and production review found no blockers. Forty-two in-memory
  validator cases passed; confirmation CLI checks rejected existing outputs, changed metadata
  and tampered binary hashes before executing any benchmark.
- There were no concurrent builds/tests during timing. Compilation, mount/reset, fixture setup,
  database creation/seeding, output assertions and cleanup are outside measured regions.
- UI timings are React development/jsdom measurements. They exclude native WebKit presentation
  and cannot establish frame rate, battery use or whole-application latency. The 1,000-row case
  is a large-list workload. Small final samples retain some JIT/GC variation.
- SQLite uses the existing WAL/default durability. Tiny file operations are sensitive to
  filesystem and scheduling variation, as shown by the mixed primary/confirmation results.
- The new workloads and counter integration reset comparison against the earlier suite; all
  three primary snapshots use the same extended harness, dependencies, build and environment.

## Reproduce

Use `3174f91` for before, `b879ded` for storage only, and `336b3e8` for final. The same frozen
harness exists on all three. With dependencies installed, run sequentially on the same idle
machine, using new output paths rather than replacing the archived evidence:

```sh
npm run bench:local -- --out output/benchmarks/dictionary-before.json
# Switch to the storage commit after the first command finishes.
npm run bench:local -- --out output/benchmarks/dictionary-storage.json --compare output/benchmarks/dictionary-before.json
# Switch to the final candidate commit after the storage measurement finishes.
npm run bench:local -- --out output/benchmarks/dictionary-after.json --compare output/benchmarks/dictionary-before.json
# The supplemental runner is added in the report commit; retained binaries must still exist.
node scripts/benchmark-rust-confirm.mjs output/benchmarks/dictionary-before.json output/benchmarks/dictionary-after.json output/benchmarks/dictionary-confirmation.json
```

## Baseline decision

Promote the final candidate: it eliminates unnecessary list work and improves large transfers
while preserving the measured outputs and tested behavior. Tiny-import results are explicitly
inconclusive/mixed; a possible tens-of-microseconds overhead is an accepted limitation of this measured change.
The branch proposes the rolling baseline; the shared default-branch reference advances when
the PR merges.
