# AI polish models

Which model to use for AI polish, by hardware and by language. How to connect each one is in
[AI polish](../ai-polish/README.md); measured numbers are in [Benchmarks](../benchmarks.md).

## Kinds of model

- **Instruct (non-thinking) models** answer straight away. Polish is a short rewrite, so a small
  instruct model is enough, and it is fast: well under a second on a GPU.
- **Thinking models** reason step by step before they answer. They are slow for polish and can
  return empty text; use an instruct model, or [turn thinking off](#turn-off-thinking).
- **Size.** 4B models are the sweet spot for polish. 7–8B models follow the rules more closely but
  answer more slowly; beyond that, larger models add little.

## By hardware

Sizes are for Q4_K_M files; "memory" is roughly what the model needs while it runs.

| Hardware | Suggested model | Rough memory | Notes |
|---|---|---|---|
| Apple Silicon, 8 GB | Qwen3 1.7B, Q4_K_M | about 1.5 GB | Typelite's Built-in **Faster** model. |
| Apple Silicon, 16 GB | Qwen3 4B Instruct 2507, Q4_K_M | about 3 GB | Typelite's Built-in **Best quality** model. |
| Apple Silicon, 32 GB or more | Qwen3 4B Instruct 2507, Q4_K_M; or a 7–8B model, Q4_K_M | about 3 GB; about 6 GB | An 8B model follows the rules more closely but answers more slowly. |
| NVIDIA GPU, 8 GB | Qwen3 4B Instruct 2507, Q4_K_M | about 3 GB VRAM | Fast; well under a second for a sentence once warm. |
| NVIDIA GPU, 12 GB | Qwen3 4B Instruct 2507, or a 7–8B model, Q4_K_M | 3–6 GB VRAM | The 4B answered a sentence in 0.1–0.3 s on an RTX 3080 Ti. |
| NVIDIA GPU, 24 GB | A 7–8B model at Q8_0, or up to about 14B at Q4_K_M | 9–10 GB VRAM | Room to spare; larger models add little for polish. |
| CPU only | Qwen3 1.7B, Q4_K_M, or a cloud service | about 1.5 GB | Expect several seconds per dictation. |

A computer that also runs speech recognition needs room for both; for example a 12 GB GPU holds
Qwen3-ASR-1.7B and a 4B polish model.

## By language

| Language | Suggested model | Notes |
|---|---|---|
| English and most European languages | Qwen3 4B Instruct 2507 | Llama 3.1 8B Instruct and similar instruct models also work well. |
| Chinese (Mandarin) | Qwen3 4B Instruct 2507; Qwen3 8B for better wording | Qwen models are trained on a lot of Chinese. |
| Cantonese | An uncensored Qwen3.5 4B (Huihui abliterated) | Stock instruct models censor many Cantonese words. The speech model matters most. See the [Cantonese guide](../languages/cantonese.md). |

Language-tuned polish models can write more naturally, but test them first: some ignore the
cleanup instructions and answer the dictation like a chatbot. A
[language preset](../languages/README.md#language-presets) often helps more than a different model.

## "Uncensored" or "abliterated" models

Standard instruct models sometimes refuse or soften slang and swear words; for example Qwen3 4B
refuses to repeat some Cantonese insults, whatever the prompt says. "Uncensored" or "abliterated"
variants have most refusal behaviour removed, so they keep what you said. The trade-offs: less
filtering of any kind, and quality varies from one variant to the next. Whether to use one is your
choice; test it like any other model.

## Turn off thinking

Thinking models reason step by step before they answer. Polish needs no reasoning, and a
thinking model can spend several seconds on it, or use up its token limit and return empty text.
Prefer an instruct (non-thinking) model; otherwise turn thinking off.

Where to enter a setting: **Settings → AI → Your server or API key**, pick your preset, open
**Advanced** under the fields and add the JSON to **Extra fields**. Server flags go on the
server's command line.

| Server or model | How to turn thinking off |
|---|---|
| Typelite Built-in | Already off; nothing to set. |
| Ollama (OpenAI-compatible API) | Extra fields `{"reasoning_effort": "none"}` |
| llama.cpp `llama-server` | Start it with `--reasoning off` (older builds: `--reasoning-budget 0`), or per request Extra fields `{"chat_template_kwargs": {"enable_thinking": false}}` |
| Qwen3 hybrid models on vLLM or SGLang | Extra fields `{"chat_template_kwargs": {"enable_thinking": false}}` |
| Groq, Qwen3 models | Extra fields `{"reasoning_effort": "none"}` |
| OpenAI reasoning models | The lowest `reasoning_effort` the model accepts (check OpenAI's docs), or pick a non-reasoning model such as `gpt-4.1-mini` |
| LM Studio, OpenRouter and others | Pick an instruct (non-thinking) model, or check your server's docs |

If you are unsure whether a model thinks, see [Troubleshooting → check thinking first](../ai-polish/troubleshooting.md#slow-or-empty-answers-check-thinking-first).
