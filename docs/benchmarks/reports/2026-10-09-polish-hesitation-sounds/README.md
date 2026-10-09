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
second wording ("the sequence words become the numbers") changed nothing and was dropped. The
final round adds one short Chinese enumeration example on a topic no case uses (先/然后/最后 →
numbered lines) and says in the examples' heading that only a single sentence stays on one
line; that brought the Chinese lists back.

## Results

Pass rate per language. "Round 1" is the list-aware dash rule alone; "final" adds the
enumeration example (the shipped state).

| Language | Dev main | Dev round 1 | Dev final | Holdout main | Holdout round 1 | Holdout final |
|---|---|---|---|---|---|---|
| en | 86% | 94% | 94% | 70% | 70% | 70% |
| es | 50% | 63% | 50% | 50% | 50% | 50% |
| fr | 75% | 75% | 88% | 0% | 50% | 0% |
| ja | 13% | 29% | 42% | 33% | 50% | 50% |
| yue | 53% | 70% | 69% | 40% | 40% | 50% |
| zh-Hans | 89% | 86% | 87% | 63% | 63% | 57% |
| **Overall** | **70%** | **77%** | **78%** | **53%** | **56%** | **55%** |

Passing samples (final): dev 239 → 268 of 342, holdout 57 → 59 of 108. Samples failing a
`must_contain` / `must_not_contain` check: dev 67 → 45, holdout 28 → 21.

Key tags (dev, main → final):

| Tag | en | yue | zh-Hans |
|---|---|---|---|
| filler | 96% → 100% | 50% → 78% | 75% → 75% |
| keep-meaning | 90% → 100% | 80% → 80% | 100% → 93% |
| self-correction | 100% → 100% | 0% → 0% | 100% → 100% |
| list | 100% → 100% | 100% → 100% | 100% → 100% |
| numbers | 63% → 88% | 0% → 25% | 100% → 100% |

Lists: `zh-014` and `yue-h03` pass 3 of 3 again (0 of 3 in round 1).

Regressions against main (final):

- `zh-h08` (holdout, filler) 3 of 3 → 0 of 3: "然后呢我们那个那个预算就是说已经超了" now keeps
  "然后呢，… 那个"; the error is 27% against a 25% limit. No must check fails.
- `zh-009` and `zh-010` (dev) 3 of 3 → 2 of 3: one sample translated "project"/"deadline"
  into Chinese. One sample, noise level.

## Validation and limitations

- No case regressed in more than one sample on a keep-meaning or must check; the totals of must
  failures fell on both splits.
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
run of this branch (final round), since the change is meant to ship.
