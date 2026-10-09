# Scoring

How an answer is judged and summarised (`scripts/evals/score.mjs`, `report.mjs`). Back to
[index](index.md).

## Polish

The error rate is Levenshtein distance over words (characters for Chinese and Japanese) after
removing punctuation, case and list markers, divided by the reference length. Punctuation,
layout and numbers are judged by named checks instead, so the error rate measures wording only.

Checks: `must_contain`, `must_not_contain`, `filler` (per-language list of sounds that are always
fillers), `dash`, `numbers` (same digit numbers), `list` and `layout` (same list lines, lines and
paragraphs), `punctuation` (same number of sentence breaks; only for cases tagged so), `script`
(Simplified vs Traditional characters) and `dialect` (Mandarin-only words in Cantonese and the
reverse). A sample passes when one reference (`expected` or an `accept`) passes every check and
the error limit (0.3 for words, 0.25 for characters, or the case's `max_error`).

A case's pass rate is the share of its n samples that pass. Summaries give the mean pass rate
per language and per tag and language, and how often each check failed.

## Speech

Character or word error rate against the exact text, measured on the answer converted into the
reference's script with the app's own converter (`stt::chinese_script`), and also raw. A wrong
script is its own check, because the app leaves Whisper's script to polish. A clip passes at 15%
error or less with no Mandarin words in a Cantonese answer.

## Baselines

A baseline stores each case's pass rate, mean error and first answer, plus model, git revision
and the hash of `prompt.rs`. A drop of 25 points or more in a case's pass rate is listed as a
regression; per-language changes are shown on the cases both runs share.

## Considered

- An LLM judge as the default: costly, noisy and itself a model to trust; deterministic checks
  explain failures. Kept as a possible opt-in.
- Exact match only: too strict for wording that varies legitimately.
