# Local benchmark code

Performance reports, the rolling baseline and the PR workflow live in
[docs/benchmarks/](../docs/benchmarks/README.md). The [current baseline](../docs/benchmarks/BASELINE.md)
is the readable starting point; [methodology](../docs/benchmarks/methodology.md) explains the workloads.

This directory contains the frontend executable fixtures and their Vitest configuration.
Rust fixtures live in `src-tauri/benches/local_performance.rs`. Keeping these paths stable
preserves the harness hashes recorded in historical reports.

```sh
npm run bench:local -- --out output/benchmarks/before.json
npm run bench:local -- --out output/benchmarks/after.json --compare output/benchmarks/before.json
```

The suite runs offline using fixed inputs and a loopback server. No models, credentials or
microphone are required. It runs separately from the ordinary unit tests and from the
[real-model inference benchmarks](../docs/guides/benchmarks/README.md).
