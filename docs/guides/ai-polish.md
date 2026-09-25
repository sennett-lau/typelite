# Set up the AI polish service

After speech recognition, Typelite sends the text to a language model that removes filler
words, applies your corrections and fixes grammar. Translate and Ask use it too. Dictation still
works without it; you get the raw transcript.

The job is small, so a 3–8B model is enough. Pick one option, enter it in **Settings → AI** (or
the setup step) and press **Test**.

## A. Ollama on this Mac

```sh
brew install ollama
ollama serve            # or open the Ollama app
ollama pull qwen3:4b-instruct-2507-q4_K_M
```

| Field | Value |
|---|---|
| Preset | Ollama on this Mac |
| Base URL | `http://127.0.0.1:11434/v1` |
| Model | `qwen3:4b-instruct-2507-q4_K_M` |

About 3 GB of memory. Downloads: [ollama.com](https://ollama.com).

## B. Ollama on another computer

On that computer, install Ollama from [ollama.com](https://ollama.com), then make it listen on the
network and keep the model loaded:

| Setting | macOS / Linux | Windows |
|---|---|---|
| Listen on the network | `OLLAMA_HOST=0.0.0.0:11434` | Set it as a user environment variable, then restart Ollama |
| Keep the model loaded | `OLLAMA_KEEP_ALIVE=-1` | same |

```sh
ollama pull qwen3:4b-instruct-2507-q4_K_M
```

In Typelite choose **Ollama on another computer** and set the base URL to
`http://<that-computer's-ip>:11434/v1`.

- Allow port 11434 through the firewall for your local network only. On Windows, check that no
  automatic "block" rule was created for `ollama.exe` the first time it ran.
- Across networks, use a private network such as Tailscale.

## C. A cloud service with your own key

| Service | Base URL | Example model |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4.1-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.1-8b-instant` |
| OpenRouter | `https://openrouter.ai/api/v1` | any chat model it lists |

Your text is sent to that service. The key is stored in the macOS Keychain.

## Thinking models

Some models "think" before answering and can take many seconds or return nothing. Use a
non-thinking (instruct) model, or add this to the preset's **Extra request fields**:

```json
{"reasoning_effort": "none"}
```

## Share presets

**Settings → AI** has **Import…** and **Export…** under the preset's server fields.

- **Export…** lists your saved AI presets (with their extra request fields); untick the ones to
  leave out and pick where to save the `.typelite-presets.json` file. Shipped presets you have
  not changed, and addresses that still hold `<computer-ip>`, are not offered. Only saved
  presets are exported, so save your edits first.
- API keys are left out. Tick **Include API keys** only if the person who gets the file may use
  your key: anyone who has the file can.
- **Import…** opens such a file and lists its presets (name and address). The ticked ones are
  added; a name that is taken gets a number, like "Groq (2)". Nothing is replaced, and the
  preset in use does not change. Pick an imported preset and press **Test** before you use it.
- A file from a newer Typelite, or one with an address that is not `http://` or `https://`,
  is rejected. Presets of a kind this version does not know are skipped.
