# Local benchmark methodology

Measurement boundaries for [code performance benchmarks](README.md).

The default is three fresh frontend and Rust processes, run sequentially. `--runs 1` is useful
for a smoke check. The initial release build can take several minutes. Each workload uses five
warmup samples and fifteen measured samples per process. The reported median is the median of
process medians; p10/p90 span all measured
samples. Compilation, server startup and fixtures are outside timing. Every workload validates
its expected output. Do not run other builds or benchmarks at the same time.

Results include every sample, workload sizes, render counts, revision and dirty status,
production and harness hashes, dependency/build hashes and machine/toolchain details. The runner
refuses comparisons with changed harnesses, workloads, builds or environments. It retains Rust executables in the
ignored `output/benchmarks/bin/` directory, keyed by executable hash, for alternating before/after
checks without reverting code. Those executables print the same raw JSON workload results.

| Workload | Measurement boundary |
|---|---|
| `ui/*/volume` | 333 individually flushed microphone updates; approximately ten seconds of event count at the app's 30 ms poll, delivered immediately. |
| `ui/*/text` | 128 individually flushed AI text chunks. |
| `chinese/short` | One Cantonese sentence with protected words and mixed English; warm OpenCC plus Cantonese fixes. |
| `chinese/long` | The same sentence repeated 64 times; a long-input stress case. |
| `chinese/no-han` | English-only fast-path control. |
| `stream/short-small-writes` | 129 content events, written in batches of at most 128 bytes by the fixture server. |
| `stream/long-batched` | 1,025 content events, server writes up to 64 KiB. |
| `stream/stress-batched` | 4,097 content events, server writes up to 256 KiB. |

UI probes independently mount the production event hook, recording hook or both. Render counts
exclude mounting and resets. A stable translation mock avoids artificial listener registrations;
state and cleanup assertions guard against "optimizing" by losing events. UI times are **React
development/jsdom proxies**, not native rendering or battery measurements.

Rust uses the app's release profile, including its size optimization. Stream times include the
real provider's prompt construction, persistent HTTP connection, response decoding, callback
accumulation and final text cleanup. Server write sizes do not guarantee client read boundaries.
The fixtures use ASCII; deterministic unit tests separately cover arbitrary UTF-8 splits.

There are no machine-dependent timing gates in CI. Run the ordinary correctness checks alongside
this suite, inspect process spread, and confirm small gains with alternating executable runs.
None of these numbers are total dictation latency or model inference speed.
