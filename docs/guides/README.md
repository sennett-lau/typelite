# Guides

Typelite works in three steps:

```
your voice ──> speech recognition ──> AI polish ──> pasted into the app you are typing in
               (speech to text)       (clean up, translate, answer)
```

Each step runs on a **connection** you choose: Built-in (on your computer, set up in one click),
your own server, or a cloud service with your own key. You can mix them, for example Built-in
speech with AI polish on a GPU computer on your network.

## Choose a setup

| You want… | Speech recognition | AI polish |
|---|---|---|
| Everything on your computer, nothing to install (Apple Silicon) | [Built-in](speech/built-in.md) | [Built-in](ai-polish/built-in.md) |
| Faster, with a GPU computer on your network | [Speaches or whisper.cpp](speech/openai-compatible.md#a-gpu-computer-on-your-network) | [Ollama](ai-polish/openai-compatible.md#ollama) or the [llama.cpp server](ai-polish/openai-compatible.md#llamacpp-server) on that computer |
| No local models (an Intel Mac, or little memory) | A cloud service with your own key, such as [Groq, OpenAI, Qwen Cloud](speech/README.md#services) | A cloud service with your own key, such as [Groq, OpenAI, OpenRouter](ai-polish/README.md#services) |

Cloud services are only used when you enter one with your own key. They then receive your audio or
text.

## Guides

| Guide | Covers |
|---|---|
| [Speech recognition](speech/README.md) | Connections (Built-in, OpenAI-compatible, Qwen Cloud) and every supported service. |
| [AI polish](ai-polish/README.md) | Connections (Built-in, OpenAI-compatible), services, thinking models. |
| [Choosing models](models/README.md) | Which speech and polish models to use, by hardware. |
| [Languages](languages/README.md) | Language guides (which models for your language, such as Cantonese), translation languages, per-language instructions, recognition, language presets. |
| [Sharing presets](sharing-presets.md) | Export and import your speech and AI presets. |
| [Benchmarks](benchmarks.md) | Reference numbers on an NVIDIA GPU and on Apple Silicon. |

Something wrong? See the troubleshooting pages for [speech](speech/troubleshooting.md) and
[AI polish](ai-polish/troubleshooting.md), or [report a bug](../../CONTRIBUTING.md#reporting-bugs).
