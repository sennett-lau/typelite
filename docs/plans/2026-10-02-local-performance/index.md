# Local performance benchmarks

Typelite needs reproducible measurements of its own overhead before changing hot paths. A small
offline suite exercises recording event subscriptions, streamed AI responses and Cantonese
transcript conversion through the production hooks and public Rust APIs. Baseline and subsequent
runs use identical fixtures and preserve raw samples so improvements can be checked independently.

Status: done — 2026-10-03

## Goals and non-goals

- Establish an untouched-production-code baseline before optimization.
- Reduce unnecessary recording UI renders and avoid repeated streaming/text allocations where
  measurements support the change.
- Preserve outputs, lifecycle cleanup, pipeline transitions and multilingual text.
- Keep the suite offline, opt-in and free of new dependencies.
- These measurements do not estimate model inference, real microphone latency, GPU performance,
  full-window rendering cost or total dictation latency.

## Key decisions

- Benchmark real production entry points; copied implementations would drift from the app.
- Use independent React updates and stable mocks; batching or changing mock identities would
  distort recording render counts.
- Treat UI render counts as primary and jsdom timings as supporting evidence; jsdom is not
  WKWebView and React runs in development mode.
- Use a persistent loopback fixture server for the real AI provider; include prompt construction,
  HTTP and callbacks rather than claiming isolated parser timings.
- Test arbitrary UTF-8 splits separately; server write boundaries are not client read boundaries.
- Use warmups, repeated samples and multiple processes; save the environment, source hashes,
  workload definitions and raw results beside median and percentile summaries.
- Run optimized Rust with the app's release profile; fixture creation and compilation are outside
  the timed sections.
- Avoid fixed timing gates in CI; machine load can change timings, while correctness and render
  regressions belong in normal tests.
- Optimize one area at a time and compare the same harness; retain conversion changes only when
  the public conversion API shows a measurable benefit.

## Parts

| File | Covers |
|---|---|
| [methodology.md](methodology.md) | Workloads, measurement boundaries and review decisions. |

## Open questions

None. A later native profiling session can determine whether local overhead matters relative to
model inference on a particular setup.
