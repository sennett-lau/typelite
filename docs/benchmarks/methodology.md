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
| `ui/waveform/silence` | 600 controlled animation frames and 300 zero-volume updates through the real Waveform component. |
| `ui/waveform/voice-and-pauses` | 600 controlled frames and 300 changing-volume updates, including pauses. |
| `ui/waveform/hidden-resume` | A twelve-hour timestamp jump followed by 120 frames; measures history catch-up CPU work. |
| `chinese/short` | One Cantonese sentence with protected words and mixed English; warm OpenCC plus Cantonese fixes. |
| `chinese/long` | The same sentence repeated 64 times; a long-input stress case. |
| `chinese/no-han` | English-only fast-path control. |
| `stream/short-small-writes` | 129 content events, written in batches of at most 128 bytes by the fixture server. |
| `stream/long-batched` | 1,025 content events, server writes up to 64 KiB. |
| `stream/stress-batched` | 4,097 content events, server writes up to 256 KiB. |
| `voice/speech-{4,60,600}s` | Speech-activity analysis of deterministic 16 kHz PCM with alternating louder/quiet regions. |
| `voice/{quiet,silence}-4s` | Quiet-speech and digital-silence controls for the same detector. |
| `ui/dictionary/add-{words,corrections}` | 24 independent input edits across two Add fields with 1,000 visible rows in the actual pane. |
| `dictionary/export-json-{0,2,20,1000,10000}` | Pretty JSON export with an equal split of words and correction rules. |
| `dictionary/import-json-*` | JSON parse and transactional import into fresh temporary SQLite WAL databases; empty/tiny/large and partial/all-duplicate cases. |

UI probes independently mount the production event hook, recording hook or both. Render counts
exclude mounting and resets. A stable translation mock avoids artificial listener registrations;
state and cleanup assertions guard against "optimizing" by losing events. UI times are **React
development/jsdom proxies**, not native rendering or battery measurements.

Waveform probes use a controlled 60 Hz clock, actual CSS setters and lightweight setter
counters. Mounting, initial animation setup, final DOM assertions and unmounting are outside
timing. A separate validation pass hashes every bar's transform/opacity after every frame;
the runner requires identical trajectories across processes and before/after. Counts and
timings include setter instrumentation equally on both versions. They do not measure native
frame presentation or energy use. A long hidden interval is a stress case, not a typical frame.

Voice checks compare every output field with a frozen reference implementation outside timing,
including edge trimming, incomplete windows, odd PCM bytes and threshold boundaries. Fixture
generation is excluded. Separate untimed allocation probes report allocation/reallocation calls,
total requested bytes and peak live requested bytes for one operation. These are Rust allocator
requests, not RSS or total application memory. The allocator's disabled tracking check remains
present equally during both versions' timing samples.

Dictionary UI probes mount once per workload and reset drafts outside timing. Lightweight
translation counters track the two edit-label evaluations in each visible row; they verify the
counter during initial rendering and report inferred row evaluations, not DOM mutations. Input
values, every row's text/labels/toggle, unchanged store data and draft persistence across section
switches are checked outside timing. These timings remain React development/jsdom proxies.

Dictionary transfer fixtures contain optional pronunciation, disabled corrections, Unicode and
escaped characters. Export bytes must equal an independent pretty-JSON fixture. Import setup,
duplicate seeding, schema creation, full read-back assertions and directory cleanup are outside
timing; parsing and the default-durability transaction are inside. The temporary database is
never the user's database. Empty and tiny commits may be dominated by SQLite/filesystem noise.

Rust uses the app's release profile, including its size optimization. Stream times include the
real provider's prompt construction, persistent HTTP connection, response decoding, callback
accumulation and final text cleanup. Server write sizes do not guarantee client read boundaries.
The fixtures use ASCII; deterministic unit tests separately cover arbitrary UTF-8 splits.

There are no machine-dependent timing gates in CI. Run the ordinary correctness checks alongside
this suite, inspect process spread, and confirm small gains with alternating executable runs.
None of these numbers are total dictation latency or model inference speed.
