# First language evaluation baseline

A quality baseline, not a performance change: the first run of the `evals/` dataset (plan
`language-evals`) through the app's real polish and speech code, before any prompt change.

## Provenance

| Field | Value |
|---|---|
| Date | 2026-10-09 |
| Kind | Quality baseline (new suite) |
| Revision | `c96ec25` plus this PR's suite (prompt.rs unchanged) |
| Hardware | Apple Silicon Mac, macOS 26 |
| AI | Built-in llama-server, `Qwen3-4B-Instruct-2507-Q4_K_M.gguf`, default settings, 3 samples per case |
| Speech | Built-in whisper.cpp, `ggml-large-v3-turbo-q5_0.bin`, language auto, 1 run per clip |
| Data | 150 polish cases (dev + holdout), 24 synthetic `say` clips |

Full summaries: [polish-summary.md](polish-summary.md), [speech-summary.md](speech-summary.md).
Baselines: `evals/baselines/polish-qwen3-4b-instruct-2507-q4-k-m.json`,
`evals/baselines/speech-ggml-large-v3-turbo-q5-0.json`.

## Results

Polish pass rate (all splits): **66%** overall.

| Language | Cases | Pass | Mean error |
|---|---:|---:|---:|
| en | 42 | 83% | 8% |
| zh-Hans | 38 | 84% | 4% |
| yue | 40 | 50% | 22% |
| fr | 10 | 60% | 11% |
| es | 10 | 50% | 21% |
| ja | 10 | 17% | 68% |

Speech (synthetic clips): en 100%, zh-Hans 100%, yue **0%** (44% character error).

## Weakest areas

1. **Japanese is translated into Simplified Chinese** (8 of 10 cases), and the dictation language
   guard does not catch it (Han characters on both sides).
2. **Cantonese fillers and self-corrections**: 呃/嗯 kept (filler 38%), self-corrections 0%
   (唔係 / 唔好意思 not treated as markers); Mandarin words creep in (我們, 這個), and one answer
   switched to Simplified.
3. **Spoken numbers outside English**: yue 0%, ja 0%, es 0%; English 60% ("fourteen", "one point
   five" left as words; "twenty two point one one" became 22.1.1).
4. **Self-corrections in Spanish and French** (0% / 50%): "no perdón", "non pardon" kept.
5. **Speech: Whisper writes Cantonese as standard written Chinese** (他/剛才/明天 for
   佢/頭先/聽日), so polish receives Mandarin-shaped text from Cantonese speakers.
6. Smaller: a dash and a kept "Hmm" in English (en-006).

`en-014` ("at three thirty not four") may be a doubtful expectation; it is left for the next
agent to judge under the `evals/AGENTS.md` rules.

## Limitations

Synthetic speech is far cleaner than real dictation. Small sets for fr, es and ja (10 each).
Routing used the app's default language list, so no language preset was applied.

## Reproduce

```sh
npm run eval -- speech --split all --whisper-model <ggml-large-v3-turbo-q5_0.bin>
npm run eval -- polish --split all --n 3 --llama-model <Qwen3-4B-Instruct-2507-Q4_K_M.gguf>
```
