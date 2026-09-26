# Built-in AI polish

Built-in runs a small language model on your computer with llama.cpp's `llama-server`, which ships
inside Typelite. No Ollama, no Terminal, no account: your text never leaves your computer.

## Set it up

Pick **Built-in** in the AI setup step, or in **Settings → AI**, choose a model and press
**Set up** (or **Download** in Settings). Typelite downloads the model, checks its SHA-256,
starts the server and sends one test request.

## The two models

| Model | File | Size | Offered on |
|---|---|---|---|
| Best quality | Qwen3 4B Instruct 2507, Q4_K_M | 2.5 GB | Apple Silicon with 16 GB of memory or more |
| Faster | Qwen3 1.7B, Q4_K_M | 1.1 GB | Apple Silicon with 8 GB of memory or more |

- The models come from Unsloth's Hugging Face repositories (Qwen does not publish Q4_K_M files
  of these two) and are released by Qwen under the Apache-2.0 licence. They are stored in
  `~/Library/Application Support/dev.typelite.mac/models/`, next to the speech models.
- Intel Macs, and Macs with less memory than the table says, get no Built-in option; use an
  [OpenAI-compatible](openai-compatible.md) server or service instead.
- **Delete** in Settings removes the model file.

## How it runs

- The server listens only on your computer (127.0.0.1, a random port and a random key that
  changes on every start), uses the GPU, and has thinking turned off (`--reasoning off`).
- It starts when Built-in is in use and stops when Typelite quits or you pick another option.
  While it runs it keeps the model in memory (about 3 GB for Best quality).
- The very first start after installing or updating Typelite takes a minute or two while macOS
  prepares the GPU code; later starts take a few seconds.
- The first polish after a start is a second or two slower, while the server processes the long
  polish instructions once and caches them. See [Benchmarks](../benchmarks.md) for measured
  numbers.

## Building Typelite yourself

`npm run build:app` builds `llama-server` first (`scripts/build-llama-server.sh`, needs `cmake`).
Without it the app still builds and runs, and Built-in AI says the server is missing. See
[CONTRIBUTING.md](../../../CONTRIBUTING.md#setup).
