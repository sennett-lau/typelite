# Speech recognition models

Which speech model to run, by hardware and by language. How to connect each one is in
[Speech recognition](../speech/README.md); measured numbers are in [Benchmarks](../benchmarks.md).

## Kinds of model

| Model family | Languages | Runs on | How Typelite reaches it |
|---|---|---|---|
| **whisper** (large-v3-turbo, small) | About 100, auto-detect; handles mixed English with Mandarin | Built-in on your computer, or a whisper.cpp or Speaches server | [Built-in](../speech/built-in.md), or [OpenAI-compatible](../speech/openai-compatible.md) |
| **Qwen3-ASR** (1.7B, 0.6B) | 30 languages and 22 Chinese dialects, auto-detect; writes Cantonese as spoken and keeps English words | llama.cpp `llama-server` (Mac, NVIDIA, CPU) or vLLM (NVIDIA) | [Qwen3-ASR](../speech/services/qwen3-asr.md) |
| **Cloud services** (OpenAI, Groq, Qwen Cloud, …) | Depends on the service | The provider's servers, with your own key; they receive your audio | [Services](../speech/README.md#services) |

- whisper is the general choice, and Typelite's Built-in. It writes some languages in their
  standard written form rather than as spoken; Cantonese, for example, comes out as formal
  written Chinese.
- Qwen3-ASR is more accurate than whisper for Chinese and its dialects, in noise, and for
  accented English (see the [Qwen3-ASR technical report](https://arxiv.org/abs/2601.21337)), and
  the one to use for Cantonese. It writes Chinese in Simplified characters; Typelite converts them
  when a dictation is recognised as one of your Traditional Chinese languages.

## By hardware

| Hardware | Suggested model | Rough size | Notes |
|---|---|---|---|
| Apple Silicon, 8 GB or more | whisper large-v3-turbo, q5_0 | 574 MB | Typelite's Built-in **Best accuracy** model; about 2 s for a short clip on an M1 Pro. |
| Apple Silicon, 16 GB or more | Qwen3-ASR-1.7B, Q8_0, with `llama-server` | about 2.5 GB | About 0.5 s for a short clip on an M1 Pro, faster than Built-in whisper. |
| Apple Silicon under 8 GB, or Intel Mac | whisper small, q5_1 | 190 MB | Typelite's Built-in **Faster** model. Less accurate, especially for mixed languages. |
| NVIDIA GPU | whisper large-v3-turbo (whisper.cpp with CUDA, or Speaches), or Qwen3-ASR-1.7B (`llama-server` with CUDA, or vLLM) | about 1.2 GB (whisper), 3.4 GB (Qwen3-ASR with llama.cpp) | About ten times faster than a laptop: 0.1–0.3 s per clip on an RTX 3080 Ti. On a small GPU, Qwen3-ASR-0.6B. |
| CPU only | whisper small or base, or a cloud service | 60–190 MB | Large models are slow on a CPU. |

## By language

| Language | Suggested model | Notes |
|---|---|---|
| English | whisper large-v3-turbo | Qwen3-ASR is as good on clean English and better with accents. |
| Mandarin | whisper large-v3-turbo, or Qwen3-ASR for higher accuracy | Pick the characters with your Chinese language and its [preset](../languages.md#language-presets). |
| Cantonese | Qwen3-ASR-1.7B | whisper turns Cantonese into formal written Chinese. See the [Cantonese guide](languages/cantonese.md). |
| Other languages | whisper large-v3-turbo | Check [whether you need a language guide](README.md#do-you-need-a-language-guide). |

## Spoken language

Leave **Settings → Speech → Language → Spoken language** on **Auto-detect**: both whisper and
Qwen3-ASR handle mixed languages that way, and report the language they heard, which Typelite uses
to pick your [language instructions](../languages.md#where-the-instructions-are-used). A fixed
language forces every recording into it.
