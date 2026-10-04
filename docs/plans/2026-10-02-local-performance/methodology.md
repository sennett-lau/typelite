# Measurement boundaries

The scope and limits of the local suite. Back to [index](index.md).

## Recording UI

A minimal mounted component calls the real event hook, recording hook or both. A fixed burst of
333 microphone events represents roughly ten seconds of updates at the backend's 30 ms interval;
the suite delivers them immediately, each in a separate React `act`. Another workload sends 128
AI text chunks. It counts component renders after mount, checks resulting store values and checks
that recording state transitions still reach the component. Tauri and translation mocks are
stable, register real callbacks and remove them on unmount.

## AI streaming

A loopback server reuses its connection and supplies deterministic SSE responses to the real
`OpenAiProvider::polish`. Small write batches and larger batched responses cover normal and
stress loads. Fixture construction, warmup, server startup and output comparisons are outside
timing. Request building, HTTP parsing, stream decoding, text accumulation and callbacks are
inside timing. No network delay or model generation is simulated. Timing improvements are
local request overhead only.

ASCII timing fixtures keep the baseline meaningful despite the existing UTF-8 split bug. The
decoder's correctness tests cover every split of multilingual payloads, CRLF, ignored lines,
errors and completion markers. TCP write sizes are documented as server writes, never as
guaranteed client chunk sizes.

## Chinese script conversion

Fixed short and long Cantonese fixtures include ordinary sentences, mixed English, protected
words containing 系/繫 and reply forms containing 復. An English fixture exercises the fast path.
The public conversion function includes OpenCC and the Cantonese adjustments. Expected text is
checked before timing; converter initialization happens in warmup. A fast internal helper alone
is insufficient evidence to claim a faster conversion feature.

## Review

The independent plan review agreed with the scope and required render counts as the primary UI
metric, deterministic tests for arbitrary byte splits, unchanged workloads across revisions and
clear separation of local overhead from inference latency. Repeated process runs and raw samples
help expose startup effects and noisy results. Small gains overlapping the observed spread need
confirmation before being presented as improvements.

Reports, the rolling baseline and the standard PR workflow live in
[docs/benchmarks](../../benchmarks/README.md). Promote the measured after snapshot with its
performance PR and preserve the report's before/after data as history.
