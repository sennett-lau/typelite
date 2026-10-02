# Reduce dictionary editing and transfer work

Keep dictionary editing and file formats unchanged while avoiding list rendering on each Add
keystroke, repeated SQL preparation during import, and cloned JSON trees during export.

Status: building - 2026-10-03.

## Goals and non-goals

- Measure actual dictionary-pane typing with 1,000 visible rows, plus empty, tiny and large
  JSON import/export workloads with duplicate controls.
- Preserve drafts across section switches, add/clear/refresh/error behavior, row contents,
  Unicode duplicate identities, transaction rollback and byte-identical JSON exports.
- Reduce unnecessary work without introducing list virtualization, new database indexes,
  dependency changes, new formats or a different visual design.

## Key decisions

- Keep all four Add draft fields inside one always-mounted child that renders the active form;
  typing can then update that child without evaluating every dictionary/correction row.
- Reuse INSERT statements within a transaction. Avoid extra preparation when there is no row
  to insert, since empty and all-duplicate imports must remain cheap.
- Serialize borrowed export views in the existing field order instead of cloning every string
  into a JSON value tree. Preserve all escaping, nulls, ordering and whitespace.
- Extend the harness and capture a fresh baseline before production changes. Record backend
  and frontend improvements in separate commits within one dictionary-focused PR.
- Preserve existing workloads as controls and report all results, including noisy small cases.

## Parts

| File | Purpose |
|---|---|
| [Methodology](../../benchmarks/methodology.md) | Workload boundaries and reproducibility |
| [Window cleanup](../2026-09-24-main-window-cleanup/index.md) | Existing dictionary UI behavior |

## Open questions

How much of large-dictionary typing and transfer time is unnecessary work, and do the changes
avoid regressions for empty/tiny or all-duplicate imports?
