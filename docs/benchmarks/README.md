# Performance benchmarks

This is the record of Typelite's application performance: recording UI updates, streaming
responses and transcript processing. Start with the [current baseline](BASELINE.md) to see the
latest measured numbers. [Speech and model benchmarks](../guides/benchmarks/README.md) cover
setup-specific inference services separately. Research that evaluates replacing a runtime,
engine or model (MLX, pure-Rust inference …) lives in [docs/research/](../research/README.md),
with its decision; it does not change the application-overhead baseline.

| Document | Purpose |
|---|---|
| [Current baseline](BASELINE.md) | Readable reference for the latest optimized snapshot and its environment. |
| [Baseline data](baseline.json) | Raw samples and provenance, usable with the benchmark runner's `--compare`. |
| [Methodology](methodology.md) | Workloads, timing boundaries, statistics and limitations. |
| [Report template](REPORT_TEMPLATE.md) | Standard report for each performance PR. |
| [Polish fillers and dashes](reports/2026-10-09-polish-dashes-and-fillers/README.md) | PR #81 with the built-in 4B model: English fillers and final dashes gone; Chinese fillers unchanged. |
| [Language evaluations](reports/2026-10-09-language-evals/README.md) | First polish and speech quality baseline per language (`evals/`). |
| [Built-in Chinese variants](reports/2026-10-09-builtin-chinese-variants/README.md) | Cantonese output comes from the Hong Kong language's instructions, not the models. |
| [Whisper encoder window](reports/2026-10-05-whisper-audio-ctx/README.md) | Built-in speech about twice as fast on short dictations. |
| [Chosen microphone](reports/2026-10-06-mic-device-cache/README.md) | Recording starts about 0.28 s sooner with a mic chosen in Settings. |
| [Native target check](reports/2026-10-05-native-target-check/README.md) | Paste's target-app check without AppleScript, about 0.5 s per dictation. |
| [Dictionary work](reports/2026-10-03-dictionary-work/README.md) | Isolated Add drafts, reused INSERTs and borrowed JSON export. |
| [Speech-check memory](reports/2026-10-03-voice-check-memory/README.md) | Direct PCM analysis and one window-level buffer. |
| [Waveform frame work](reports/2026-10-03-waveform-work/README.md) | Fewer repeated style writes and bounded resume work. |
| [First improvement](reports/2026-10-03-local-overhead/README.md) | Recording subscriptions, stream buffering and Cantonese conversion. |

## Structure

```text
docs/benchmarks/
  README.md
  BASELINE.md                 # generated readable baseline
  baseline.json               # current after snapshot, with a report backlink
  methodology.md
  REPORT_TEMPLATE.md
  reports/
    YYYY-MM-DD-short-slug/
      README.md               # completed report template
      before.json             # fresh measurement of the PR base
      after.json              # measurement of the proposed change
      ...                     # optional intermediate / alternating measurements
```

Report directories are append-only evidence. Keep both raw snapshots and any confirming runs;
never replace old measurements when the baseline advances. Add a dated correction if a report
needs an interpretation fixed. Executable fixtures remain in `benchmarks/` and
`src-tauri/benches/`; the runner is `scripts/benchmark-local.mjs`.

## Decisions, including no change

Before repeating an optimization proposal, search [docs/research/](../research/README.md) and
the reports here for the component or runtime name. A performance experiment that does not
result in a shipping change still gets a dated record: in its report here when it tunes
Typelite's own code, or as a research entry when it evaluates a different runtime, engine or
model. A new runtime release or hardware target can justify new evidence; the same hypothesis
alone does not.

Keep rejected and deferred candidates in their reports. Do not promote an experimental
runtime into `baseline.json` merely because one workload is faster. Use a new dated report
when the inputs, acceptance criteria or implementation change.

## Performance PR workflow

1. Identify a user-visible cost or measured hot path and read the current baseline. Define the
   workloads and expected outputs before changing production code. If a workload is missing,
   add it first and use that same harness on both versions.
2. Create `reports/YYYY-MM-DD-short-slug/README.md` from the report template. On the PR base,
   capture a **fresh before run** on the machine that will measure the candidate. Record the
   revision, source hash and any uncommitted instrumentation. The committed baseline is a
   reference, not a substitute for this fresh measurement.
3. Make one focused improvement at a time. Capture the candidate with the same harness,
   dependencies, build settings, hardware and toolchain. Keep intermediate results when they
   explain which change helped. Run benchmarks without concurrent builds or tests.
4. Report all workloads, including controls and regressions. Include median, p10/p90, units,
   deterministic counts where relevant, absolute savings and the user-facing implication.
   Label changes within noise as inconclusive; use alternating runs to confirm small gains.
   Run correctness checks and explain any accepted tradeoffs.
5. Promote the completed report in the same PR. Reviewers see both the proposed baseline
   update and its before/after evidence. The shared baseline advances when that PR merges;
   unmerged experiments do not change the baseline on the default branch.
6. If another change lands in the same performance path before merge, rebase and repeat the
   affected measurements before updating the proposed baseline.

For example, from the repository root (substitute the report directory):

```sh
mkdir -p docs/benchmarks/reports/2026-10-04-example
cp docs/benchmarks/REPORT_TEMPLATE.md docs/benchmarks/reports/2026-10-04-example/README.md

# On the PR base, before changing production code:
npm run bench:local -- --out docs/benchmarks/reports/2026-10-04-example/before.json

# On the candidate, using the same harness:
npm run bench:local -- --out docs/benchmarks/reports/2026-10-04-example/after.json --compare docs/benchmarks/reports/2026-10-04-example/before.json

# After completing the report and correctness checks, propose the new baseline:
node scripts/benchmark-baseline.mjs docs/benchmarks/reports/2026-10-04-example
node scripts/benchmark-baseline.mjs --check
```

The promotion command verifies matching before/after metadata and workloads, requires at least
three process runs with fifteen measured samples each, and generates `BASELINE.md` and
`baseline.json` from the archived `after.json`. It does
not decide whether an optimization is worthwhile; that judgment belongs in the report and PR.
The [PR template](../../.github/pull_request_template.md) points reviewers to this evidence.

## Changing the benchmark

Keep workload IDs stable while their meaning stays the same. New input sizes, timing boundaries,
fixtures or units need a new workload ID or a documented suite revision. Record why a workload
was added or retired; dropping a slow workload is not an improvement.

When the harness, dependencies, build settings, machine or toolchain changes, the old baseline
may no longer be comparable. Measure the PR base and candidate under the **same new setup**,
and mark the report as a baseline reset. Archive the old reference and start a new comparison
series; never present differences between incompatible environments as a code speedup. If the
change itself modifies the toolchain/dependencies/build profile, isolate and describe that
experiment separately rather than bypassing the local runner's compatibility checks.

## Reading the numbers

The default is three process runs with fifteen measured samples each, after warmup. Use the
median of process medians and the sample p10/p90 range, as described in
[methodology](methodology.md). A smoke run with `--runs 1` cannot become a baseline.

For time, allocation and render counts, lower is better. Report signed percentage change as
`(after / before - 1) × 100`; a negative value means a reduction. When the before value is zero,
use an absolute difference instead of a percentage. Higher-is-better metrics such as throughput
must say so explicitly. Separate confirmed gains from noisy results.

CI checks the baseline's consistency, not machine-dependent timing thresholds. Correctness and
deterministic behavior remain normal tests. These local measurements do not measure model
inference, microphone latency, native-window rendering or battery usage.
