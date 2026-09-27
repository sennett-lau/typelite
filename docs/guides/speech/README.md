# Speech recognition

Speech recognition turns your recording into text. Typelite then polishes that text with
[AI polish](../ai-polish/README.md) and pastes it. Choose it in the speech step of the setup, or
later in **Settings → Speech**.

## Connections

A connection is how Typelite talks to the service. You never pick it by hand: **Built-in** is
its own option, and in **Your server or API key** the address decides.

| Connection | What it is | Where your audio goes | Guide |
|---|---|---|---|
| Built-in | whisper.cpp running inside Typelite, with a model it downloads for you | Nowhere; it stays on your computer | [Built-in](built-in.md) |
| OpenAI-compatible | Any server that accepts `POST <address>/audio/transcriptions`: your own whisper.cpp or Speaches server, or a cloud service | Your server, or the cloud service you chose | [OpenAI-compatible](openai-compatible.md) |
| Qwen Cloud | Qwen's own speech API, used automatically for a Qwen Cloud address | Qwen Cloud, with your own key | [Qwen Cloud](qwen-cloud.md) |

Not sure? Start with Built-in. If it is too slow on your computer, a GPU computer on your network
or a cloud service is faster; see [Choosing models](../models/speech-recognition.md) and
[Benchmarks](../benchmarks.md).

## Services

"Your network" means a server on another computer you run; cloud services need your own API key
and receive your audio. The last column links to the setup.

| Service | Runs | Cost | API key | Address (example) | Model (example) | Notes |
|---|---|---|---|---|---|---|
| [Built-in (whisper.cpp)](built-in.md) | On your computer | Free | No | — | large-v3-turbo or small | About 100 languages, auto-detect. One click; audio never leaves your computer. |
| [whisper.cpp server](openai-compatible.md#whispercpp) | Your computer or network | Free | No | `http://127.0.0.1:8178/v1` | `large-v3-turbo` | About 100 languages, auto-detect. |
| [Qwen3-ASR](openai-compatible.md#qwen3-asr) | Your computer or network | Free | No | `http://127.0.0.1:8180/v1` | `qwen3-asr` | 30 languages and 22 Chinese dialects. Writes Cantonese as spoken, with English words kept. |
| [Speaches (faster-whisper)](openai-compatible.md#speaches) | Your network | Free | No | `http://<computer-address>:8000/v1` | `Systran/faster-whisper-large-v3` | Fast on a computer with an NVIDIA GPU. |
| [LocalAI](openai-compatible.md#localai) | Your computer or network | Free | No | `http://127.0.0.1:8080/v1` | `whisper-1` | The name of the Whisper model you installed. |
| [Groq](openai-compatible.md#cloud-services) | Cloud | Free tier | Yes | `https://api.groq.com/openai/v1` | `whisper-large-v3-turbo` | Free daily allowance. |
| [OpenAI](openai-compatible.md#cloud-services) | Cloud | Paid | Yes | `https://api.openai.com/v1` | `whisper-1` | gpt-4o-transcribe also works. |
| [Mistral](openai-compatible.md#cloud-services) | Cloud | Paid | Yes | `https://api.mistral.ai/v1` | `voxtral-mini-latest` | |
| [Together AI](openai-compatible.md#cloud-services) | Cloud | Paid | Yes | `https://api.together.xyz/v1` | `openai/whisper-large-v3` | |
| [Qwen Cloud](qwen-cloud.md) | Cloud | Paid | Yes | `https://token-plan.maas.qwencloudapi.com/api/v1` | `qwen-audio-3.0-asr-flash` | Mixed English, Mandarin and Cantonese. Needs a Token Plan. |

Other services that accept the OpenAI transcription API should work too: enter their address and
model. To add one to this list, see [Adding a service](../../../CONTRIBUTING.md#adding-a-service).

## More

- [Troubleshooting](troubleshooting.md): Test fails, slow recognition, nothing pasted.
- [Sharing presets](../sharing-presets.md): export and import your speech presets.
- [Languages](../languages/README.md): the recognition language and hints.
