# Built-in speech and AI: where Cantonese-style Chinese comes from

Correctness investigation, not a speed change. Users of the built-in models reported Cantonese
characters and phrasing (嘅 咗 喺 唔 冇 佢) when they wanted standard Chinese. This report finds
which step produces them.

## Provenance

- Base: `origin/main` at c96ec25 (1.1.2). No production code changed.
- Machine: Apple M1 Pro, 32 GB, macOS 26.
- Speech: the app's in-process whisper.cpp (`stt::builtin::engine`) through
  `src-tauri/examples/benchmark_speech.rs`, greedy, the app's own parameters. Models:
  `ggml-large-v3-turbo-q5_0.bin` (recommended) and `ggml-small-q5_1.bin` (the smaller offer).
- AI: the bundled llama-server started with the app's arguments (`llm::builtin::launch_spec`:
  `--n-gpu-layers 999 --ctx-size 4096 --parallel 1 --reasoning off`), temperature 0.3,
  max tokens 4096 (the app defaults). Models: `Qwen3-4B-Instruct-2507-Q4_K_M.gguf`
  (recommended, pinned file) and `Qwen3-1.7B-Q4_K_M.gguf` (the faster offer).
- Prompt: the app's real system prompt, built by `llm::prompt::build_system_prompt_with_scene`
  through the new `src-tauri/examples/benchmark_polish_prompt.rs` (General app, "clean" style,
  Chinese script "preserve"; with a `target` it builds the Translate prompt with that target's
  built-in instructions). The pipeline also passes a voice intent; plain dictation adds nothing
  that concerns language.
- Corpus (`benchmarks/chinese-variants/corpus.json`): 10 Mandarin sentences (two with fillers),
  5 Mandarin–English code-mixed, 8 colloquial Cantonese, 5 English, with their ground truth.
  Audio from macOS `say`: Mandarin with Tingting (zh_CN), Meijia (zh_TW) and Eddy (zh_CN),
  code-mixed with Tingting and Meijia, Cantonese with Sinji (zh_HK), English with Samantha:
  53 clips, 1.5–5 s. Audio is generated, not committed (`make_audio.py`).

Metrics (`benchmarks/chinese-variants/metrics.py`): character error rate (CER) after removing
punctuation and converting both sides to Simplified; Cantonese marks (Cantonese-only characters
such as 嘅 咗 喺 唔 冇 佢 哋 睇 俾, plus words such as 聽日 而家 點解); script (Simplified /
Traditional by marker characters); median latency per clip.

## Change and hypothesis

Candidates checked in code first:

| Step | Default | Can it push toward Cantonese? |
|---|---|---|
| Speech model | large-v3-turbo q5_0 (`stt/models.rs`), language `auto` (`stt/config.rs`) | whisper large-v3 has a `yue` token; auto could pick it |
| Language routing | Language list `["en"]` for a new user (`storage/mod.rs`) | Only when Cantonese (Hong Kong) is in the list, by hint (`require_hint`) |
| Script conversion | `stt/chinese_script.rs`, only for Qwen3-ASR answers (`pipeline.rs`) | Not on the built-in path |
| Polish prompt | `BASE_PROMPT` has a CANTONESE rule and 3 Cantonese examples of 4 Chinese ones | Possible on a small model |
| Translate target `zh-Hant-HK` | Shown as "Chinese (Traditional, Hong Kong)"; built-in instructions `HONG_KONG_INSTRUCTIONS` say "Write colloquial written Cantonese" | Yes, by design of the text |

## Results

### Speech (built-in whisper.cpp)

| Model, language | Voice set | n | CER | Cantonese marks | Detected | Script | Median ms |
|---|---|---|---|---|---|---|---|
| turbo, auto | Mandarin Tingting / Meijia / Eddy | 30 | 0.013 / 0.018 / 0.040 | 0 | zh 30/30 | Simplified 29, Trad 1 | 1,500 |
| turbo, auto | Code-mixed | 10 | 0.000 | 0 | zh 10/10 | Simplified 10 | 1,495 |
| turbo, auto | English | 5 | 0.018 | 0 | en 5/5 | – | 1,495 |
| turbo, auto | Cantonese (Sinji) | 8 | 0.460 | 1 | zh 8/8 | Trad 7 | 1,508 |
| turbo, `zh` | Mandarin | 30 | same as auto | 0 | – | same | **794** |
| turbo, `yue` | Mandarin | 30 | 0.013–0.040 | 0 | – | Simplified 30 | 817 |
| small, auto | Mandarin | 30 | 0.038 / 0.026 / 0.195 | 0 | zh 29, my 1 | **Trad 18**, Simplified 10 | 260 |
| small, auto | Cantonese | 8 | 0.438 | 3 | zh 8/8 | Trad 7 | 353 |

Whisper never wrote Cantonese words for Mandarin speech, in any setting (0 marks in 140 Mandarin
and code-mixed transcriptions). For Cantonese speech it writes standard written Chinese
(他不在家裡 for 佢唔喺屋企), hence the high CER against colloquial truth. Even with `yue` forced,
Mandarin stays Mandarin. Side findings: auto-detect costs about 0.7 s per clip on turbo (an extra
encoder pass; 1.50 s vs 0.79 s with a fixed language), and the small model writes Mandarin in
Traditional characters in 18 of 30 clips.

### AI polish on Dictate (default language list, no routing)

| AI model | Input | n | Rows that gained Cantonese marks | CER vs input | Median ms |
|---|---|---|---|---|---|
| 4B | Ground truth, Mandarin + code-mixed (×3) | 45 | **0** | 0.027 / 0.232 | 490 |
| 4B | turbo transcripts, Mandarin + code-mixed (×2) | 80 | **0** | 0.027 / 0.285 | 510 |
| 4B | small transcripts, Mandarin + code-mixed (×2) | 80 | **0** | 0.004 / 0.172 | 960 |
| 1.7B | turbo transcripts, Mandarin + code-mixed | 40 | **0** | 0.055 / 0.219 | 240 |

Polish did not add Cantonese to Mandarin in 245 runs. It also left Cantonese input Cantonese.
Script changes were only toward the input's own script (Traditional transcripts from whisper
came out Simplified in a few rows; the "preserve" detection counted them as Simplified). Side
finding: the 4B model translates English words in code-mixed Mandarin (email → 邮件, update →
更新, report → 报告), which is the CER of 0.23–0.29.

The router cannot pick Cantonese for this Mandarin either: none of the 80 Mandarin transcripts
contains a hint of the Cantonese (Hong Kong) preset, even after Hong Kong conversion, and that
preset requires one for `zh`.

### Translate to "Chinese (Traditional, Hong Kong)" — the reproduction

| AI model | Target | Mandarin rows with Cantonese marks | Code-mixed | English |
|---|---|---|---|---|
| 4B | `zh-Hant-HK` (built-in instructions) | **8 / 10** | 2 / 5 | **4 / 5** |
| 4B | `zh-Hant-TW` | 0 / 10 | 0 / 5 | 0 / 5 |
| 4B | `zh-Hans` | 0 / 10 | 0 / 5 | 0 / 5 |
| 4B | `zh-Hant-HK` with written-Chinese instructions (below) | **0 / 10** | 0 / 5 | 0 / 5 |
| 1.7B | `zh-Hant-HK` (built-in) | 0 / 10 | 0 / 5 | 0 / 5 (did not translate) |

Examples (4B, built-in Hong Kong instructions):

- 嗯，那个，我今天很忙，没空吃饭。 → 我今日好忙，冇空食飯。
- 她不在家，你晚一点再给她打电话吧。 → 她唔在屋，你晚啲再同她電話喇。
- 他刚才说这份报告明天才可以给我们。 → 他剛才說咗呢份報告明天才可以俾我們。
- We already sent the file to the client, but they have not replied yet. → 我們已經送咗文件到客戶，但佢哋仲未有回复。

The output is often a broken mix of Cantonese and Mandarin, which matches the reports.

## Cause

**Not speech recognition and not the polish prompt: it is the `zh-Hant-HK` language's built-in
instructions.** The language list and Translate chips call `zh-Hant-HK` "Chinese (Traditional,
Hong Kong)" (`src/lib/constants.ts:49`, `en.json` `zhHantHK`) and the prompt names it
"Traditional Chinese as written in Hong Kong (繁體中文（香港）)" (`llm/prompt.rs`
`TRANSLATION_LANGUAGE_NAMES`), but `default_translation_instructions("zh-Hant-HK")`
(`llm/prompt.rs`, the `"zh-Hant-HK" => HONG_KONG_INSTRUCTIONS` arm) returns
`HONG_KONG_INSTRUCTIONS`, which begins "Write colloquial written Cantonese … not formal written
Chinese (書面語) and not Mandarin". A user who picks Hong Kong Traditional Chinese to get
Traditional characters gets Cantonese. With the recommended 4B model that is 8 of 10 Mandarin
sentences and 4 of 5 English ones. The same text is used wherever the language's instructions
apply: Translate, and Dictate polish when the router picks that language (only with a preset hint,
so rarely for Mandarin).

The variant that reproduces: **Translate (or any use of the language) with "Chinese (Traditional,
Hong Kong)" chosen, recommended Qwen3-4B**. Plain Dictate with the default settings does not
reproduce it (0 of 245).

## Validation and limitations

- Synthetic voices: real Mandarin speakers with accents (for example Hong Kong speakers speaking
  Mandarin) may be detected as `yue` or give Cantonese words; not tested. A real-dictation
  corpus would settle it.
- Ablation of the polish prompt's Cantonese rule and examples was prepared (`run_polish.py`
  variant `no-yue`) but not needed: the unchanged prompt added no Cantonese.
- With written-Chinese instructions the 4B model still left 4 of 10 Mandarin rows in Simplified
  (it does not convert script reliably); see the fix.
- Alternative speech or AI models (SenseVoice, Qwen3-ASR, Belle whisper fine-tunes, other Qwen
  sizes) were not benchmarked: the models are not the cause, so the recommended models stay.

## Proposed fix (not in this PR)

1. `src-tauri/src/llm/prompt.rs`, `HONG_KONG_INSTRUCTIONS`: replace the colloquial-Cantonese text
   with written Chinese in Hong Kong characters, for example the text measured above:
   "Write standard written Chinese (書面語) as used in Hong Kong, in Hong Kong Traditional
   characters. It is not colloquial Cantonese: never use Cantonese-only words or particles
   (嘅 咗 喺 啲 冇 唔 佢 哋 嘢 睇 俾 囉 喇). Use Hong Kong vocabulary (軟件, 網絡, 手提電腦, 巴士,
   的士) and full-width Chinese punctuation; write numbers and times as digits. Keep the meaning,
   tone and register of the original. Keep names, brands and technical terms as they are."
   Update `test_cantonese_default_writes_hong_kong_code_mixed_cantonese` and the router test that
   asserts `starts_with("Written Cantonese")` only for the preset (unchanged). Cantonese stays
   available through the opt-in `cantonese-hong-kong` preset, which already carries the
   colloquial text; if a built-in Cantonese option is wanted, add it as its own code
   (`yue-Hant-HK`, label "Cantonese (Hong Kong)") instead of reusing `zh-Hant-HK`.
2. `src-tauri/src/pipeline.rs`: after a Translate answer whose target has a fixed script
   (`stt::chinese_script::ChineseScript::for_language(target)`), run `chinese_script::convert`
   on the answer, as `commands/ask.rs` already does for Ask answers. Small models do not convert
   script reliably (4 of 10 left Simplified above); OpenCC does, and it changes characters only.
3. Optional, separate: `BASE_PROMPT` rule 5 says to keep English words, yet the 4B model
   translated them in code-mixed Mandarin; and auto-detect costs ~0.7 s per built-in dictation,
   which a single-language user could avoid by fixing the language.

## Reproduce

```sh
cd src-tauri
cargo build --release --example benchmark_speech --example benchmark_polish_prompt
pip3 install --user opencc-python-reimplemented
python3 ../benchmarks/chinese-variants/make_audio.py
python3 ../benchmarks/chinese-variants/run_stt.py target/release/examples/benchmark_speech <ggml model> turbo auto zh
# start llama-server with the app's arguments on port 18431, then:
python3 ../benchmarks/chinese-variants/run_polish.py target/release/examples/benchmark_polish_prompt 18431 4b-truth-tr-zh-Hant-HK truth tr-zh-Hant-HK 1
```

Raw results: `stt-*.json` and `polish-*.json` in this folder (labels as in the tables).

## Baseline decision

No change to `baseline.json`: this report measures correctness and model latency, which the
local application-overhead baseline does not cover.
