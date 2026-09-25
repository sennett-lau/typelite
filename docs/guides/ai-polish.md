# Set up the AI polish service

After speech recognition, Typelite sends the text to a language model that removes filler
words, applies your corrections and fixes grammar. Translate and Ask use it too. Dictation still
works without it; you get the raw transcript.

The job is small, so a 2–8B model is enough. **Settings → AI → AI polish uses** has two options:
**Built-in** (a model that runs inside Typelite on this Mac) or **your server or API key** (any
OpenAI-compatible chat service).

## Built-in (this Mac)

Pick a model and press **Set up** (or **Download** in Settings). Typelite downloads the model,
checks its SHA-256, starts it and sends one test request. No Ollama, no Terminal.

| Model | File | Size | Offered on |
|---|---|---|---|
| Best quality | Qwen3 4B Instruct 2507, Q4_K_M | 2.5 GB | Apple Silicon with 16 GB of memory or more |
| Faster | Qwen3 1.7B, Q4_K_M | 1.1 GB | Apple Silicon with 8 GB of memory or more |

- The models come from Unsloth's Hugging Face repositories (Qwen does not publish Q4_K_M files
  of these two) and are released by Qwen under the Apache-2.0 licence. They are stored in
  `~/Library/Application Support/dev.typelite.mac/models/`, next to the speech models.
- Typelite runs them with llama.cpp's `llama-server`, which ships inside the app. It listens only
  on this Mac (127.0.0.1, a random port and a random key), uses the GPU, and has thinking turned
  off. It starts when Built-in is in use and stops when Typelite quits or you pick another
  option. While it runs it keeps the model in memory (about 3 GB for Best quality).
- The very first start after installing or updating Typelite takes a minute or two while macOS
  prepares the GPU code; later starts take a few seconds.
- Intel Macs, and Macs with less memory than the table says, get no Built-in option; use one of
  the options below.
- **Delete** in Settings removes the model file.

Building Typelite yourself: `npm run build:app` builds `llama-server` first
(`scripts/build-llama-server.sh`, needs `cmake`). Without it the app still builds and runs, and
Built-in AI says the server is missing.

## Your own server or API key

Pick **Use your own server or API key…** in onboarding, or **Your server or API key** in
Settings → AI, and fill in the address and model; the API key is optional. Press **Test**, then
**Save**. The key is stored in the macOS Keychain.

### A. Ollama on this Mac

```sh
brew install ollama
ollama serve            # or open the Ollama app
ollama pull qwen3:4b-instruct-2507-q4_K_M
```

| Field | Value |
|---|---|
| Address | `http://127.0.0.1:11434/v1` |
| Model | `qwen3:4b-instruct-2507-q4_K_M` |

About 3 GB of memory. Downloads: [ollama.com](https://ollama.com).

### B. Ollama on another computer

On that computer, install Ollama from [ollama.com](https://ollama.com), then make it listen on the
network and keep the model loaded:

| Setting | macOS / Linux | Windows |
|---|---|---|
| Listen on the network | `OLLAMA_HOST=0.0.0.0:11434` | Set it as a user environment variable, then restart Ollama |
| Keep the model loaded | `OLLAMA_KEEP_ALIVE=-1` | same |

```sh
ollama pull qwen3:4b-instruct-2507-q4_K_M
```

In Typelite set the address to `http://<that-computer's-ip>:11434/v1`.

- Allow port 11434 through the firewall for your local network only. On Windows, check that no
  automatic "block" rule was created for `ollama.exe` the first time it ran.
- Across networks, use a private network such as Tailscale.

### C. A cloud service with your own key

| Service | Address | Example model |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4.1-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.1-8b-instant` |
| OpenRouter | `https://openrouter.ai/api/v1` | any chat model it lists |

Your text is sent to that service.

## Thinking models

Some models "think" before answering and can take many seconds or return nothing. Use a
non-thinking (instruct) model, or open **Advanced** under the form and add this to **Extra
fields**:

```json
{"reasoning_effort": "none"}
```

Built-in models always run with thinking off.
