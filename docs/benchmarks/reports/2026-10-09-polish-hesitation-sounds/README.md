# Polish fillers, dashes and hesitation sounds, measured with the evaluations

## Provenance

- Date: 2026-10-09. Apple Silicon Mac, built-in AI (llama-server from
  `scripts/build-llama-server.sh`) with `Qwen3-4B-Instruct-2507-Q4_K_M.gguf`.
- Tool: `npm run eval -- polish` (`evals/`), all six languages, n = 3 samples per case, dev
  (114 cases) and holdout (36 cases), default language list.
- Before: `main` at e5eb451 (the evaluation suite just merged). After: PR #81 with the
  changes below.

## Change and hypothesis

PR #81 replaces the filler and self-correction word lists in the prompt with general rules,
bans clause dashes (with a code clean-up in `llm/dashes.rs`), and adds
`llm/hesitations.rs`: a code step that removes a small closed set of standalone hesitation
sounds (um, uh, erm, hmm, euh, ehm, äh, 嗯, 呃) that the 4B model leaves, most of all at the
start. Words with meaning (那个, 就是说, 即係, so, like) stay the model's job.

The first measurement showed that the dash rule ("use a comma or a period") made the model
write enumerations on one line (en-017, en-030, zh-014, yue-h03). The rule now says it applies
inside a sentence and does not change the list rule; that fixed English but not Chinese. A
second wording ("the sequence words become the numbers") changed nothing and was dropped.

## Results

Pass rate per language (a case passes when its samples pass; percentages as in `summary.md`):

| Language | Dev main | Dev #81 | Holdout main | Holdout #81 |
|---|---|---|---|---|
| en | 86% | 94% | 70% | 70% |
| es | 50% | 63% | 50% | 50% |
| fr | 75% | 75% | 0% | 50% |
| ja | 13% | 29% | 33% | 50% |
| yue | 53% | 70% | 40% | 40% |
| zh-Hans | 89% | 86% | 63% | 63% |
| **Overall** | **70%** | **77%** | **53%** | **56%** |

Passing samples: dev 239 → 265 of 342, holdout 57 → 61 of 108. Samples failing a
`must_contain` / `must_not_contain` check: dev 67 → 43, holdout 28 → 18.

Key tags (dev):

| Tag | en | yue | zh-Hans |
|---|---|---|---|
| filler | 96% → 100% | 50% → 78% | 75% → 75% |
| keep-meaning | 90% → 100% | 80% → 80% | 100% → 100% |
| self-correction | 100% → 100% | 0% → 0% | 100% → 100% |
| list | 100% → 100% | 100% → 100% | 100% → 50% |
| numbers | 63% → 88% | 0% → 33% | 100% → 100% |

Regressions (3 of 3 samples, consistent):

- `zh-014` (dev) and `yue-h03` (holdout): a Chinese enumeration (首先/然后/最后, 第一/第二) is
  written as one sentence instead of a numbered list.
- `zh-003` (1 of 3 → 0 of 3) and `zh-h01` (2 of 3 → 1 of 3): 就是说 / 那个 at the start kept; noise
  level, and these words are left to the model by design.

## Validation and limitations

- Keep-meaning and `must_contain` checks did not regress in any language on either split.
- Still failing on both revisions: Cantonese self-corrections with 唔係 (yue-004 「三點鐘唔係唔好意思
  四點鐘」 keeps both times), Japanese answers translated into Chinese (routing, not this PR),
  Spanish/French fillers that are words (o sea, bon ben).
- 3 samples per case; a one-sample difference is noise.

## Reproduce

```sh
npm run eval -- polish --llama-model <path>/Qwen3-4B-Instruct-2507-Q4_K_M.gguf --split dev --n 3
npm run eval -- polish --llama-model <path>/Qwen3-4B-Instruct-2507-Q4_K_M.gguf --split holdout --n 3
```

Run once on `main` and once on this branch.

## Baseline decision

`evals/baselines/polish-qwen3-4b-instruct-2507-q4-k-m.json` is updated from a `--split all`
run of this branch, since the change is meant to ship.
