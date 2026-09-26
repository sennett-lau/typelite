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

## Translation languages

**Settings → AI → Translation** lists your languages (up to three), one row each:

- The **order** is the order the Switch language key and the pill follow. Drag a row by its
  ⋮⋮ handle to change it (or focus the handle and press ↑ / ↓).
- The grey line says where the language's instructions come from: a preset from the library,
  your own edit ("Based on … · edited"), or the built-in instructions.
- The **switch** turns the language's instructions on or off. Off means a plain translation
  into that language, and no extra notes when you dictate in it. Your text is kept.
- **Edit** opens the language's settings, ✕ removes it, and **＋ Add language** adds one.

Every translation uses the AI polish model: the Translate shortcut, "Always translate output",
highlight-and-translate and Ask's "translate this into …".

## Language presets

A language preset tells the AI how to write one language: which words and grammar to use,
which script, which words stay in English, with a few examples. Presets live in the
[`presets/languages`](../../presets/languages) folder of the Typelite repository; anyone can
add one with a pull request (see its README).

### Choosing a preset

1. Press **Edit** on a language, then **Browse presets** (or **Change**).
2. The list starts with the **Built-in default**, then the presets that fit the language:
   **Official** ones first, and the one written for exactly your language (for example
   `en-GB`) before a general one. Each shows its summary, version, authors and a model tip.
   English presets carry short notes per region, so English (UK) gets British spelling.
3. **Preview** downloads the preset and shows the full text the AI will get. Nothing is used
   until you press **Use this preset**, then **Save**.

You can edit the text afterwards. **Reset to preset** brings back the preset's text; **Reset
to default** goes back to the built-in instructions. Typelite always adds its own rules around
your text (output only the result, keep the line breaks, use the right Chinese script), so a
preset or an edit cannot make the AI add notes or answer in another language.

### Where the instructions are used

- **Translating into the language** uses them whenever the language is on.
- **Dictating in the language** (Dictate, no translation, no selected text) uses them too, but
  only when Typelite recognises that you spoke that language. The **Recognition** tab shows how:
  1. **Hint characters and words** found in what you said pick the language with the most
     hits. The preset brings its own (Cantonese: 嘅 咗 喺 唔 聽日 …); add your own with
     **+ Add hint**.
  2. Otherwise the language **speech recognition heard** counts (for example `en`), unless the
     preset needs a hint. The Cantonese preset does: speech recognition says `zh` for Mandarin
     too, and Mandarin should not get Cantonese rules.
  3. Otherwise nothing is added and polish works as before.

  Built-in speech recognition reports the language it heard; a server gets asked for it with
  `response_format=verbose_json` (servers that do not support it keep working). A speech preset
  with a fixed language counts as that language. A language on its built-in instructions has no
  recognition data, so only your own hints route to it.

### Updates

- A newer version shows an **Update** tag on the row and a banner in the sheet: **Preview** or
  **Update**. If you edited the text, it is never replaced: **Keep mine** keeps your text, **Use
  vN instead** shows the new text first.
- Tick **Update this preset automatically** to let a language follow new versions by itself.
  Then Typelite checks GitHub at most once a day, only while such a language is in use, and
  never replaces text you edited.

### Privacy and offline use

- Presets are downloaded with plain requests to `raw.githubusercontent.com`: no account, no
  identifiers, nothing about you, your languages or your text. GitHub sees your IP address, as
  with any download. Typelite goes online only when you browse presets, or once a day for
  languages with automatic updates on.
- Every download is checked against the size and SHA-256 hash in the library's index, and
  validated, before it is used. Downloaded presets are kept in Typelite's data folder.
- Offline, the built-in instructions and downloaded presets keep working; Browse shows what is
  downloaded and offers **Try again**.

The built-in instructions are a plain, natural translation for most languages, plus:

| Language | Built-in instructions |
|---|---|
| Chinese (Traditional, Hong Kong) | Colloquial written Cantonese as Hong Kong people type it (嘅 咗 喺 啲 冇 唔…), with the English words Hongkongers say in English kept in English: "你可唔可以幫我check下個proposal嘅deadline？". Edit it if you want formal written Chinese. |
| Chinese (Traditional, Taiwan) | Taiwan Mandarin wording and vocabulary (軟體, 網路, 計程車). |
| Chinese (Simplified) | Mainland wording and vocabulary (软件, 网络, 出租车). |

Small 4B models write passable Cantonese but still slip into written Chinese now and then; a
larger or Cantonese-tuned model as the AI polish model does better.

## Share presets

**Settings → AI → Your server or API key** has **Import…** and **Export…** under the preset's
fields.

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
