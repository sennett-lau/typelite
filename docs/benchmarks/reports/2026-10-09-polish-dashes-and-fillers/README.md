# Built-in AI polish: fillers and clause dashes, before and after

Correctness check of PR #81 (plan `polish-dashes-and-fillers`) with the built-in AI, not a
speed change. It asks whether the new prompt and the dash clean-up remove fillers and clause
dashes without removing words that carry meaning.

## Provenance

- Before: `origin/main` at c96ec25. After: `fix/polish-dashes-and-fillers` at 00025a0.
- Machine: Apple M1 Pro, 32 GB, macOS 26. Measured 2026-10-09 (JST).
- AI: the bundled llama-server with the app's arguments (`--n-gpu-layers 999 --ctx-size 4096
  --parallel 1 --reasoning off`), `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` (recommended),
  temperature 0.3, max tokens 4096, no streaming. One warm-up pass per revision, then 3 runs of
  each input per revision (72 answers each).
- Prompt and output: each revision's own `build_system_prompt_with_scene` (General app,
  "clean" style, Chinese script "preserve"), through `src-tauri/examples/benchmark_polish_prompt.rs`
  from PR #82, extended so that `{"text", "output"}` returns the answer after the app's
  clean-up: `plain_spaces` and then `strip_unspoken_final_period` (before) or
  `clean_dictation_output` (after), family General.
- Corpus (`benchmarks/polish-fillers/corpus.json`): 24 typed transcripts, no audio. 10 English
  with fillers, self-corrections or dash-prone asides; 4 Cantonese (呃, 即係, 嗯, a 唔係…唔好意思
  correction); 4 Mandarin (那个, 就是, 然后, 不对); 6 English counter-examples where "No",
  "sorry", "like", "so", "actually" and "no" carry meaning.

Counting (read by hand from the final text; raw answers are in the JSON):

- Fillers remaining: occurrences of the listed fillers and of corrected-away words left in the
  output (for example "三點" after "唔係…四點"). Unlisted fillers are noted below, not counted.
- Meaningful words removed: counter-example keywords missing.
- Clause dashes: a dash joining two clauses in the final text (raw answers in brackets).
- Meaning changes: the output says something the speaker did not.

## Results

| Measure (72 answers, lower is better) | Before | After |
|---|---:|---:|
| Fillers remaining, English (en1–en10) | 4 | 1 |
| Fillers remaining, Chinese (cmn, yue) | 24 | 24 |
| Meaningful words removed (ce1–ce6) | 0 | 0 |
| Clause dashes in final text (raw answer) | 1 (1) | 0 (3) |
| Meaning changes | 3 | 0 |
| Latency median / mean / p90, ms | 524 / 553 / 794 | 559 / 566 / 784 |

Median latency by group, before → after: English 518 → 516, counter-examples 594 → 563,
Mandarin 442 → 440, Cantonese 703 → 730 ms. The overall median moved by +35 ms and the mean by
+13 ms; that is within run-to-run noise for single answers (the same input varied by up to
250 ms), so latency is unchanged in practice.

English improves: "basically" (en7) is now removed in all runs; one "Hmm" remains (en8, 1 of 3).
All self-corrections (en3, en4, cmn4) were already right before and stay right. All six
counter-examples keep their meaningful word in both revisions.

Failures that remain after the change:

- **Chinese fillers are untouched.** Both revisions keep 那个 (cmn1), 那个 inside cmn2, 就是说
  (cmn3), 呃 (yue1), 即係 ×2 (yue2) and 嗯 (yue3) in all 3 runs, although the new prompt names
  them and has a Cantonese example. Only 嗯 in the middle of cmn3 and the doubled 然后 are removed.
- **Cantonese self-correction is not applied.** yue4 "三點鐘唔係唔好意思四點鐘…" keeps both
  times in every run of both revisions. The SELF-CORRECTIONS list has Mandarin markers (不对,
  我是说) but no Cantonese ones (唔係, 唔好意思, 講錯).
- **The model writes more dashes than before**: 3 raw clause dashes after vs 1 before (all en8,
  "let me think—the server…"); the deterministic clean-up turns them into commas, so the final
  text has none. The prompt rule alone did not stop them.
- en8: "let me think" now stays in all 3 runs (before dropped it with "Hmm" in 2 of 3). It is not
  in the filler list, so not counted, but the output reads "Let me think, the server crashed…".
- en1: a leading "So" stays in both revisions although "so" is in the new filler list.

Meaning changes (before only): yue4 was translated from Cantonese into Simplified Mandarin in
all 3 runs ("三点钟不好意思，四点钟在会议室等"), and run 2 added "不是"
("三点钟不是不好意思…"). After, yue4 stays in Cantonese. No other output changes the meaning;
en10 after ("works on my machine but not on staging") and ce5 after ("it was actually a race
condition") are rewordings with the same meaning.

## Proposed prompt fix (not applied)

1. Add Cantonese correction markers to SELF-CORRECTIONS: "唔係", "唔好意思", "講錯", "應該係",
   with the example "三點鐘唔係唔好意思四點鐘" → "四點鐘".
2. Say where Chinese fillers sit and that they go even at the start: "Chinese fillers usually
   open the sentence or a clause (那个我们…, 即係話…, 呃我哋…); delete them there too." Add one
   Mandarin example, `"那个我们明天的会议就是要讨论一下预算"` → `我们明天的会议要讨论一下预算`,
   next to the Cantonese one (the 4B model does not generalise from a single Cantonese example).
3. Add "let me think" and "hmm" to the English list.

## Reproduce

```sh
# both revisions, each with src-tauri/examples/benchmark_polish_prompt.rs from PR #82 plus the
# "output" branch described above
cd src-tauri && cargo build --release --example benchmark_polish_prompt
llama-server --model Qwen3-4B-Instruct-2507-Q4_K_M.gguf --alias qwen3-4b --host 127.0.0.1 \
  --port 18432 --n-gpu-layers 999 --ctx-size 4096 --parallel 1 --reasoning off --no-webui --offline
cd benchmarks/polish-fillers   # run.py reads corpus.json from the working folder
python3 run.py <path>/benchmark_polish_prompt before 3   # then "after" with the PR build
```

Raw results: `before.json` and `after.json` in this folder (`raw` is the model answer, `final`
the text the app would paste).

## Baseline decision

No change to `baseline.json`: this report measures polish correctness and model latency, which
the local application-overhead baseline does not cover.
