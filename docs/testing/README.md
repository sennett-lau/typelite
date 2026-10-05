# Testing

Tests should fail when an observable contract breaks. Prefer inputs, actions and results over
copies of implementation details. The required commands live in
[CONTRIBUTING.md](../../CONTRIBUTING.md#the-offline-gate).

## Choosing the right test

- Test algorithms and boundary cases at their smallest useful public interface. Use named table
  cases for the same operation with different inputs; give each failing case useful context.
- Test components through accessible controls, callbacks, state changes and error recovery.
  Integration tests should cover wiring between components or services, rather than repeat every
  child component's rendering assertions.
- Keep command names, serialized fields, privacy exclusions, migrations and protocol boundaries
  explicit. They are contracts even when their assertions contain literal strings.
- Use synthetic releases, versions, names and model data when testing rendering. A new release,
  translation edit or catalog entry should not require changing unrelated tests.
- Check locale keys, nonempty messages and interpolation variables centrally. Check which key and
  interpolation values a helper selects when that selection is the behavior under test.
- Avoid source-text searches, marketing copy, CSS spacing assertions, counts of fixture entries,
  and assertions that merely confirm the test's mock or the document exists. Use browser visual
  review for appearance. Keep geometry and visibility checks when they protect native window
  sizing, focus, reduced motion or timed transitions.
- Before deleting overlapping coverage, identify the test that still catches the failure. Similar
  scenarios at different boundaries can be useful: a provider's HTTP request and the UI action
  calling that provider can each break independently.
- Replace weak assertions with a meaningful contract when that exposes a gap. Test count alone
  is not a quality or performance metric.

## Suite responsibilities

| Suite | Responsibility |
|---|---|
| `src/**/__tests__/` | Frontend behavior, state, algorithms, typed IPC and localization contracts |
| Rust inline test modules in `src-tauri/src/` | Parsing, streaming, routing, storage, platform decisions and local service simulations |
| `src-tauri/tests/e2e_services.rs` | Opt-in checks against real speech/AI/search services and model installations |
| `npm run docs:check` | Actual documentation data, links and generated tables; unit tests separately exercise the validators |
| `node scripts/language-presets.mjs --check` | Published preset/index consistency; Rust tests also check the application's independent parser |
| `npm run bench:local` | Repeated measurements using frozen workloads; see [performance baselines](../benchmarks/README.md) |

The published polish-prompt comparison in Rust is a reproducibility check for
[model benchmarks](../guides/benchmarks/polish-speed.md), not evidence that a model obeys the
prompt. Preserve prompt assembly, sanitization, precedence and selected-text tests; use the
optional real-service tests to evaluate model output. Do not run those external tests as part of
the offline gate.

## Review record

The [2026-10-03 audit](reviews/2026-10-03-test-audit.md) records the suite inventory, coverage
ownership, removals and validation for the first cleanup. Future reviews should explain which
contract is retained or strengthened when consolidating tests.
