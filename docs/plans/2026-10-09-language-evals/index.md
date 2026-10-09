# Language evaluations

An evaluation suite for the two steps that need only text and audio: AI polish and speech
recognition. It holds Typelite's own dataset per language (fillers, self-corrections, spoken
numbers, punctuation, line breaks and lists, script and dialect), runs it through the app's real
code with the built-in or any OpenAI-compatible server, scores the answers deterministically and
compares them with a saved baseline. It exists so an agent can keep adding cases and tune the
polish prompt on its own, without UI tests, and so the community can add languages and data.

Status: building (2026-10-09)

## Goals

- Common polishing works for every language: hesitation sounds, self-corrections, spoken numbers
  ("um five point five" → 5.5), Chinese fillers, sentence ends, newlines and lists.
- One command per step, results that point at the failing cases, and a baseline that shows
  regressions.
- Extendable: a new language is a folder of JSON Lines plus one entry in `languages.json`.
- Offline validation in the normal gate (`npm run docs:check`) and unit-tested scorers.

## Non-goals

- UI, paste, shortcut or permission behaviour (those need the app running).
- Tuning the speech recognizer itself; speech results inform model choice and what polish repairs.
- An LLM judge as the pass/fail rule (it may come later as an opt-in extra).
- Translate, Ask and selected-text operations (dictation only for now).

## Key decisions

- **Rust driver, Node scorer.** `src-tauri/examples/eval_run.rs` calls the same functions as a
  dictation, so results reflect the app; scoring and reports are plain Node, tested by vitest,
  so the dataset and scorers can change without a Rust build.
- **Deterministic checks first.** Error rate plus named checks (filler, dash, numbers, layout,
  list, punctuation, script, dialect, must/must-not) make failures explainable and cheap.
- **A case must pass its own checks.** `check` scores each `expected` and `accept`, so a case
  cannot contradict itself.
- **dev and holdout splits.** Holdout is never used for tuning; it measures overfitting.
- **Default settings.** Cases run with the app's default settings and language list; `--languages`
  emulates a user who added more languages.
- **Synthetic speech is generated, not committed.** `say` clips are reproducible on macOS and keep
  the repo light; real recordings (preferred) are committed.
- **Baselines per step and model** in `evals/baselines/`, with each case's pass rate and first answer.

## Parts

| File | Covers |
|---|---|
| [dataset.md](dataset.md) | Layout, case and clip formats, splits, languages, contribution rules. |
| [scoring.md](scoring.md) | Error rates and checks, pass rules, summaries and baseline comparison. |
| [runner.md](runner.md) | The command, the Rust driver, servers, outputs. |
| [workflow.md](workflow.md) | The agent loop and its rules (detail in `evals/AGENTS.md`). |

## Migration from earlier harnesses

PR #81 (`benchmarks/polish-fillers/`) and PR #82 (`benchmarks/chinese-variants/`,
`src-tauri/examples/benchmark_polish_prompt.rs`) carried their own corpora and Python runners.
Their cases are folded into `evals/` (credited in each case's `notes`); after this plan lands,
those harnesses can be retired and new checks added here instead.

## Open questions

- Should runs also apply a language preset from `presets/languages/` (through a temporary
  library store), to measure presets themselves?
- A round-trip mode (speech answer → polish) for whole dictations.
- Real recordings: who records, and a fetch script for an external CC0 set.
- An opt-in LLM judge for meaning preservation on long dictations.
