# Choosing a model

These are starting points, not requirements: any model that fits your hardware and follows
instructions well will work. Measured numbers are in [Benchmarks](benchmarks.md).

## By hardware

### AI polish

Polish is a short rewrite, so a small instruct (non-thinking) model is enough. Sizes are for
Q4_K_M files; "memory" is roughly what the model needs while it runs.

| Hardware | Suggested model | Rough memory | Notes |
|---|---|---|---|
| Apple Silicon, 8 GB | Qwen3 1.7B, Q4_K_M | about 1.5 GB | Typelite's Built-in **Faster** model. |
| Apple Silicon, 16 GB | Qwen3 4B Instruct 2507, Q4_K_M | about 3 GB | Typelite's Built-in **Best quality** model. |
| Apple Silicon, 32 GB or more | Qwen3 4B Instruct 2507, Q4_K_M; or a 7–8B model, Q4_K_M | about 3 GB; about 6 GB | An 8B model follows the rules more closely but answers more slowly. |
| NVIDIA GPU, 8 GB | Qwen3 4B Instruct 2507, Q4_K_M | about 3 GB VRAM | Fast; well under a second for a sentence once warm. |
| NVIDIA GPU, 12 GB | Qwen3 4B Instruct 2507, or a 7–8B model, Q4_K_M | 3–6 GB VRAM | The 4B answered a sentence in 0.1–0.3 s on an RTX 3080 Ti. |
| NVIDIA GPU, 24 GB | A 7–8B model at Q8_0, or up to about 14B at Q4_K_M | 9–10 GB VRAM | Room to spare; larger models add little for polish. |
| CPU only | Qwen3 1.7B, Q4_K_M, or a cloud service | about 1.5 GB | Expect several seconds per dictation. |

### Speech recognition

| Hardware | Suggested model | Rough size | Notes |
|---|---|---|---|
| Apple Silicon, 8 GB or more | whisper large-v3-turbo, q5_0 | 574 MB | Typelite's Built-in **Best accuracy** model; about 2 s for a short clip on an M1 Pro. |
| Apple Silicon under 8 GB, or Intel Mac | whisper small, q5_1 | 190 MB | Typelite's Built-in **Faster** model. Less accurate, especially for mixed languages. |
| NVIDIA GPU | large-v3 or large-v3-turbo with faster-whisper (Speaches) or whisper.cpp with CUDA | a few GB of VRAM | Several times faster than a laptop; see [OpenAI-compatible speech](speech/openai-compatible.md#a-gpu-computer-on-your-network). |
| CPU only | whisper small or base, or a cloud service | 60–190 MB | Large models are slow on a CPU. |

## By language

| Language | Suggested model | Notes |
|---|---|---|
| English and most European languages | Qwen3 4B Instruct 2507 | Llama 3.1 8B Instruct and similar instruct models also work well. |
| Chinese (Mandarin) | Qwen3 4B Instruct 2507; Qwen3 8B for better wording | Qwen models are trained on a lot of Chinese. |
| Cantonese (written Cantonese) | Qwen3 4B Instruct 2507 to start; for better Cantonese, hon9kon9ize CantoneseLLM v2.0 8B, or plain Qwen3 8B | See below. |

**Cantonese.** Small 4B models write passable written Cantonese but slip into formal written
Chinese now and then. [CantoneseLLM v2.0 8B](https://huggingface.co/hon9kon9ize/CantoneseLLM-v2.0-8B-Thinking)
by hon9kon9ize is a Qwen3-8B model trained further on Hong Kong Cantonese (Apache-2.0 on its model
card, about 5.0 GB at Q4_K_M, with Cantonese benchmark results on the card). It is a thinking
model, so [turn thinking off](#turn-off-thinking) and test it on your own sentences. Plain Qwen3 8B
is a simpler alternative. The language instructions matter as much as the model: use the
[Cantonese (Hong Kong) preset](../../presets/languages/cantonese-hong-kong/preset.md) (see
[Languages](languages.md)).

**"Uncensored" or "abliterated" models.** Some people use these variants, which have had most
refusal behaviour removed, because they keep slang and swear words as spoken instead of softening
or refusing them. The trade-offs: less filtering of any kind, and quality varies from one
variant to the next. Whether to use one is your choice; test it like any other model.

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

If you are unsure whether a model thinks, see [Thinking models](ai-polish/thinking-models.md#how-to-tell).
