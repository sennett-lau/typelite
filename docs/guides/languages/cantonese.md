---
id: cantonese
language: Cantonese (Hong Kong)
codes: zh-Hant-HK, yue
speech: Qwen3-ASR-1.7B
polish: Huihui Qwen3.5 4B abliterated (uncensored)
tier: official
authors: sennett-lau
preset: cantonese-hong-kong
tested: 2026-09-27
notes: Whisper writes Cantonese as formal written Chinese; Qwen3-ASR keeps it as spoken, with English words.
---

# Cantonese (Hong Kong)

For people who dictate in Hong Kong Cantonese, often mixed with English, and want it written the
way Hongkongers type messages: 我哋聽日開會，你記得send個email俾佢. Use Qwen3-ASR for speech
recognition, an uncensored Qwen3.5 4B for polish, and the Cantonese (Hong Kong) language
preset.

## Recommended setup

| Step | Model | Why |
|---|---|---|
| Speech recognition | [Qwen3-ASR-1.7B](../speech/openai-compatible.md#qwen3-asr) (Apache-2.0) | Writes what you said in Cantonese (我哋, 聽日, 咗, 緊, 咯) and keeps the English words you mix in. |
| AI polish | [Huihui-Qwen3.5-4B-abliterated](https://huggingface.co/huihui-ai/Huihui-Qwen3.5-4B-abliterated) (tested) | Given a Cantonese transcript, it only has to clean up: fillers, self-corrections, punctuation. Use an uncensored model: stock instruct models soften or drop Cantonese slang and swear words, so the text stops sounding native. |
| Language preset | [Cantonese (Hong Kong)](../../../presets/languages/cantonese-hong-kong/preset.md) | Tells polish how Hongkongers write, and lets Typelite recognise that you spoke Cantonese. |

## Why

Speech recognition decides which words reach polish, and whisper, Typelite's Built-in model,
rewrites Cantonese into formal written Chinese. For the sentence

> 我一直都keep住試緊廣東話，但出嚟嘅效果好似唔係咁好咯

whisper large-v3-turbo wrote "我一直都記住試廣東話，但出來的效果好像不是這樣". The Cantonese words,
the English word "keep" and part of the meaning ("唔係咁好", not so good) were gone before polish
saw the text, and no polish model or prompt can bring them back. Qwen3-ASR wrote the sentence as it
was said.

## Set it up

1. **Run Qwen3-ASR** on your Mac or on a computer with an NVIDIA GPU, with llama.cpp's
   `llama-server` (on Windows, the CUDA build from llama.cpp's releases; see
   [Qwen3-ASR](../speech/openai-compatible.md#qwen3-asr) for vLLM and other options):

   ```sh
   llama-server -hf ggml-org/Qwen3-ASR-1.7B-GGUF:Q8_0 --host 127.0.0.1 --port 8180 -c 4096 -np 1
   ```

   The first start downloads the model and its audio encoder (about 2.5 GB). To serve other
   computers, use `--host 0.0.0.0` and allow the port through that computer's firewall for your
   network only.

2. **Add it in Typelite:** **Settings → Speech → Your server or API key**, address
   `http://127.0.0.1:8180/v1` (or that computer's address), model `qwen3-asr`, no API key, and
   leave **Spoken language** on **Auto-detect**. Press **Test**, then **Save**.

3. **Choose the Cantonese preset:** **Settings → AI → Translation**, add Chinese (Traditional,
   Hong Kong) if it is not in your list, press **Edit**, then **Browse presets** and use
   **Cantonese (Hong Kong)**. Without the preset Typelite cannot tell that you spoke Cantonese, and
   neither the Cantonese notes nor the Hong Kong characters (next step) are applied.

4. **Characters:** Qwen3-ASR writes Cantonese in Simplified characters. When a dictation is
   recognised as Cantonese (Hong Kong), Typelite writes it in Hong Kong Traditional characters,
   with Cantonese 係 and 覆 where a plain conversion would write 系 or 復. Nothing to set.

5. **AI polish:** [Huihui-Qwen3.5-4B-abliterated](https://huggingface.co/huihui-ai/Huihui-Qwen3.5-4B-abliterated), an
   ["uncensored" variant](../models/ai-polish.md#uncensored-or-abliterated-models) of Qwen3.5 4B.
   Stock Qwen models refuse to repeat some Cantonese insults; this one keeps them. Huihui publishes
   the original weights; for llama.cpp use a GGUF such as
   [mradermacher's](https://huggingface.co/mradermacher/Huihui-Qwen3.5-4B-abliterated-GGUF)
   (Q4_K_M, about 3 GB of memory) with the [llama.cpp server](../ai-polish/openai-compatible.md#llamacpp-server):

   ```sh
   llama-server -m Huihui-Qwen3.5-4B-abliterated.Q4_K_M.gguf --host 127.0.0.1 --port 8181 \
     --jinja --reasoning off
   ```

   Qwen3.5 thinks by default, so keep `--reasoning off`. Ollama's own Qwen3.5 files do not load in
   llama.cpp, hence the separate GGUF. Avoid stock instruct models such as Qwen3 4B
   Instruct: they censor many everyday Cantonese words.

## Results

Measured with 11 Cantonese clips and 1 English clip made with the macOS Cantonese voice (Sinji):
ten everyday sentences with fillers, a self-correction, English words and a swear word, plus the
13-second sentence above. Details in [Benchmarks](../benchmarks.md#speech-recognition-cantonese).

| Speech model | Error rate | Cantonese words kept | English words kept |
|---|---|---|---|
| whisper large-v3-turbo | 43.8% | 2 of 50 | 7 of 18 |
| Qwen3-ASR-1.7B, in Hong Kong characters | 2.4% | 49 of 50 | 18 of 18 |

| Hardware | Server | Short clip | 13-second clip |
|---|---|---|---|
| NVIDIA RTX 3080 Ti | llama.cpp `llama-server` (CUDA), Q8_0 | 0.10 s | 0.27 s |
| NVIDIA RTX 3080 Ti | vLLM | 0.14 s | 0.37 s |
| Apple M1 Pro | llama.cpp `llama-server`, Q8_0 | 0.45 s | 1.7 s |

With the Qwen3-ASR transcript, polish with the Cantonese preset kept the text 96% the same as what
was said, with no formal written Chinese left; with whisper's transcript, 62%.

## Known issues

- A self-correction said without a pause ("下個禮拜三唔係禮拜四") is sometimes resolved to the
  wrong day.
- The clips are synthetic. Real speech, with its speed and accents, will score lower for every
  model; tell us how it does with yours.
- Qwen3-ASR-1.7B needs about 3.4 GB of VRAM with llama.cpp (Q8_0), about 7 GB with vLLM. On a
  smaller GPU, use Qwen3-ASR-0.6B.
