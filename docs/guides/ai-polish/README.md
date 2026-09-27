# AI polish

After [speech recognition](../speech/README.md), Typelite sends the text to a language model that
removes filler words, applies your self-corrections, adds punctuation and fixes grammar. Translate
and Ask use the same model. Dictation still works without it; you then get the raw transcript.

The job is small, so a 2–8B instruct model is enough. Choose it in the AI step of the setup, or
later in **Settings → AI → AI polish uses**.

## Connections

| Connection | What it is | Where your text goes | Guide |
|---|---|---|---|
| Built-in | llama.cpp's `llama-server`, shipped inside Typelite, with a model it downloads for you (Apple Silicon) | Nowhere; it stays on your computer | [Built-in](built-in.md) |
| OpenAI-compatible | Any chat server that accepts `POST <address>/chat/completions`: Ollama, LM Studio, llama.cpp, or a cloud service | Your server, or the cloud service you chose | [OpenAI-compatible](openai-compatible.md) |

Not sure? Start with Built-in on Apple Silicon. On an Intel Mac, or for faster answers, use a
server on your network or a cloud key; see [AI polish models](../models/ai-polish.md) and
[Benchmarks](../benchmarks.md).

## Services

"Your network" means a server on another computer you run; cloud services need your own API key
and receive your text. How to turn off thinking for each is in
[AI polish models](../models/ai-polish.md#turn-off-thinking).

| Service | Runs | Cost | API key | Address (example) | Model (example) | Notes |
|---|---|---|---|---|---|---|
| [Built-in (llama-server)](built-in.md) | On your computer | Free | No | — | Qwen3 4B Instruct 2507 or Qwen3 1.7B | One click on Apple Silicon; text never leaves your computer. |
| [Ollama](openai-compatible.md#ollama) | Your computer or network | Free | No | `http://127.0.0.1:11434/v1` | `qwen3:4b-instruct-2507-q4_K_M` | About 3 GB of memory for the 4B model. |
| [llama.cpp server](openai-compatible.md#llamacpp-server) | Your computer or network | Free | No | `http://127.0.0.1:8080/v1` | any (the loaded model is used) | Any GGUF model. |
| [LM Studio](openai-compatible.md#lm-studio) | Your computer or network | Free | No | `http://127.0.0.1:1234/v1` | `qwen3-4b-instruct-2507` | The model identifier LM Studio shows. |
| [Groq](openai-compatible.md#cloud-services) | Cloud | Free tier | Yes | `https://api.groq.com/openai/v1` | `llama-3.1-8b-instant` | Free daily allowance. |
| [OpenAI](openai-compatible.md#cloud-services) | Cloud | Paid | Yes | `https://api.openai.com/v1` | `gpt-4.1-mini` | |
| [OpenRouter](openai-compatible.md#cloud-services) | Cloud | Paid | Yes | `https://openrouter.ai/api/v1` | `qwen/qwen3-4b-instruct-2507` | Many models behind one key; some are free. |

Other services with an OpenAI-compatible chat API should work too. To add one to this list, see
[Adding a service](../../../CONTRIBUTING.md#adding-a-service).

## More

- [AI polish models](../models/ai-polish.md): suggestions by hardware and by language.
- [Thinking models](thinking-models.md): why they are slow for polish and how to turn thinking off.
- [Languages](../languages/README.md): translation languages and per-language instructions.
- [Troubleshooting](troubleshooting.md): Test fails, empty answers, slow polish.
- [Sharing presets](../sharing-presets.md): export and import your AI presets.
