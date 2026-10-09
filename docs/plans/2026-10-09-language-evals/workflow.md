# Agent workflow

How an agent uses the suite to improve polish without the owner watching. Back to
[index](index.md). The working version is `evals/AGENTS.md`.

Run dev, sort failures into model errors, case errors and noise, fix cases, add coverage, then
change the prompt only for patterns across cases, with general rules. Rerun dev, check holdout
and the baseline, write a report in `docs/benchmarks/reports/`, and update the baseline only for
a change meant to ship.

The rules that keep this honest: never copy case text into the prompt; never edit holdout to
pass or tune on it; keep the prompt short and prefer code for deterministic fixes; report every
regression, including other languages; use several samples per case.
