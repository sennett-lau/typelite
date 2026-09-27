---
id: qwen3-asr
name: Qwen3-ASR (llama.cpp or vLLM)
connection: openai-compatible
address: http://127.0.0.1:8180/v1
model: qwen3-asr
needs_key: false
runs: on-device
cost: free
languages: 30 languages and 22 Chinese dialects, auto-detect
notes: Writes Cantonese as spoken, with English words kept. Can also run on a GPU computer.
---

[Qwen3-ASR](https://huggingface.co/Qwen/Qwen3-ASR-1.7B) is an open speech recognition model from
the Qwen team (Apache-2.0; 1.7B parameters, and a smaller 0.6B). Unlike whisper it writes Cantonese
the way it is spoken (我哋, 聽日, 咗, 緊) and keeps English words in English; it is also more
accurate for Mandarin and in noise. See the [Cantonese guide](../../languages/cantonese.md).

Run it with llama.cpp's `llama-server` on a Mac, an NVIDIA GPU or the CPU:

```sh
llama-server -hf ggml-org/Qwen3-ASR-1.7B-GGUF:Q8_0 --host 127.0.0.1 --port 8180 -c 4096 -np 1
```

or with vLLM on an NVIDIA GPU; see [Running your own server → Qwen3-ASR](../openai-compatible.md#qwen3-asr).
Typelite removes the language tag Qwen3-ASR puts in front of its text and uses it as the detected
language, and writes the text in the characters of your Chinese language when it recognises one.
