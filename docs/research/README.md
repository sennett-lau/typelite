# Research and decisions

Investigations into options Typelite might adopt (a runtime, an engine, a model, a library)
and what was decided. Each entry keeps its question, decision, evidence and the conditions for
looking again, so the same idea is not researched twice.

**Before starting research or proposing to replace a runtime, engine, model or library, read
the entries below.** If one covers it, do not repeat it unless its "Reopen when" conditions are
met, and say which one.

| Date | Entry | Question | Outcome | Reopen when (short) |
|---|---|---|---|---|
| 2026-10-03 | [mlx-runtime](2026-10-03-mlx-runtime/index.md) | Run built-in speech and AI on Apple's MLX instead of whisper.cpp / llama.cpp? | **Deferred.** Speech 24–25% faster in a Python prototype, not enough evidence to switch; text: no useful gain | Real-dictation corpus and a native integration prototype |

Outcomes: **Adopted** (shipped or planned), **Rejected** (do not pursue), **Deferred**
(promising, needs the listed evidence).

## An entry

One folder per investigation, `YYYY-MM-DD-short-slug/` (the date the research started; the slug
is unique across `docs/research/`):

```
docs/research/
  README.md                  ← this index
  2026-10-03-mlx-runtime/
    index.md                 ← the decision (required)
    report.md                ← method and results (when measured)
    *.json                   ← raw data
```

`index.md` states, in this order:

1. Title, outcome and date.
2. Scope: what was tested (machine, models, versions) and what was not.
3. The decision and why, with the key numbers.
4. Alternatives considered.
5. Reopen when: concrete conditions, not "if it gets faster".

Add a row to the table above in the same pull request. Entries are append-only evidence: when
new research changes an outcome, add a new entry that links to the old one, and add a dated
"Superseded by" line to the old `index.md` instead of rewriting it.

Prototype code that is not adopted stays out of the repository's main line; name the branch or
commit that holds it in the report, so the result can be reproduced. Harnesses and fixtures
meant for reuse live in `benchmarks/`.

Plans (`docs/plans/`) describe what we are building; a plan that runs an evaluation links to its
research entry for the result.
