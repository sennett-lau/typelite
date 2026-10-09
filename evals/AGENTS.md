# Improving polish and speech with the evaluations

The loop for an agent asked to add or refine dataset cases, or to tune the polish prompt
(`src-tauri/src/llm/prompt.rs`). Commands and formats are in [README.md](README.md).

## The loop

1. **Run dev.** `npm run eval -- polish --llama-model <gguf>` (or `--ai-url`). Read
   `output/evals/<run>/summary.md`: pass rate per language and tag, failed checks, and every
   failing case with the model's answer.
2. **Sort the failures.** For each failing case decide: the model is wrong (a prompt or code
   problem), the case is wrong (a better answer is missing from `accept`, or the expectation is
   doubtful), or it is noise (passes 2 of 3). Fix wrong cases first.
3. **Add cases** where coverage is thin: a tag with few cases in a language, a pattern seen in a
   real report, a counter-example where a meaningful word must survive. Run
   `npm run eval -- check` after each edit.
4. **Change the prompt** only for a pattern that fails across several cases or languages. Write a
   general rule ("a spoken decimal becomes digits"), not a word list or a copy of a case.
5. **Rerun dev**, then **holdout** (`--split holdout`) and compare with the baseline. The summary's
   "Against baseline" section lists regressions per case and per language.
6. **Report** in `docs/benchmarks/reports/YYYY-MM-DD-short-slug/README.md`: model, settings,
   before and after per language and tag, regressions, and what changed.
7. **Update the baseline** (`--split all --save-baseline`) only when the change is meant to ship,
   in the same PR as the report.

## Rules

- **Never copy case text into the prompt**, and never add an example to the prompt that matches a
  dev or holdout case. That measures memory, not polish.
- **Never edit a holdout case to make it pass**, and never tune while looking at holdout failures.
  Holdout exists to catch overfitting to dev.
- **Keep the prompt short.** A small model follows a few clear rules better than many. Remove a
  rule that no longer earns its place; prefer fixing a deterministic problem in code (as
  `strip_unspoken_final_period` does) over another prompt line.
- **Report regressions honestly**, including in languages you did not work on. A gain in one
  language that costs another is a trade-off for the owner to decide, not a win.
- **Use n ≥ 3** before trusting a change; a 1-of-3 difference on one case is noise.
- Change one thing at a time, and keep each run's `summary.md` for the report.
- Speech: the recognizer is not tuned here. Use speech results to choose models and to decide
  what polish must repair (for example Cantonese written as standard Chinese).
- No private data in cases, and no private machine names or addresses in reports.
