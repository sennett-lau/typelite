# <Short description of the performance change>

<!-- Copy into reports/YYYY-MM-DD-short-slug/README.md and replace the prompts. -->

Describe the concrete cost, who encounters it and what changed. Explain why the complexity is
worth the measured benefit.

## Provenance

| Field | Value |
|---|---|
| Report date and time zone | |
| Kind | Performance improvement / baseline reset |
| PR | Link, or "not opened yet" |
| Previous baseline report | Link the report currently named in BASELINE.md before promotion. |
| Base revision and source SHA-256 | From before.json; identify uncommitted instrumentation. |
| Candidate revision and source SHA-256 | From after.json; a Git revision alone does not identify dirty working-tree measurements. |
| Harness / dependency / build hashes | Confirm they match between the two snapshots. |
| Hardware, OS and toolchain | Copy the environment from the raw results. |
| Process runs / warmup / measured samples | |

Raw data: link this report's `before.json` and `after.json`, plus any intermediate or alternating runs.

## Change and hypothesis

- Cost identified and evidence locating it:
- Implementation and why it should help:
- Behavior that must stay the same:
- Alternatives considered or changes rejected after measurement:

## Results

Include every measured workload, including unchanged controls and regressions. Split a table
when metrics have different units. Values below use `median [p10, p90]` for timings. Add render,
allocation or other deterministic counts where useful. State whether lower or higher is better.

| Workload ID / metric / unit | Before | After | Signed change | Evidence and practical effect |
|---|---:|---:|---:|---|
| | | | | Confirmed / inconclusive / regression; include absolute savings. |

Percentage change is `(after / before - 1) × 100`. Use absolute differences for a zero baseline.
Do not infer whole-app latency or battery savings from an isolated local workload.

## Validation and limitations

- Correctness checks, outcomes, ignored tests and remaining warnings:
- Repetition or alternating execution used to check noise:
- Regression / tradeoff decisions and why they are acceptable:
- What is excluded from these measurements:
- Any environment or suite change, why it resets the reference, and which comparisons remain valid:

## Reproduce

Give the exact commands, version selection and fixture/setup requirements for both snapshots.
Follow the performance PR workflow in `docs/benchmarks/README.md`. Explain how the same harness
was made available on the PR base before measuring.

## Baseline decision

State why this candidate is the next reference, or why the baseline stays unchanged. For a
confirmed improvement, generate the proposed update with
`node scripts/benchmark-baseline.mjs <this-report-directory>` and include both generated files
in the PR. The default-branch baseline changes only when the PR merges.
