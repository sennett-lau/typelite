<p align="center">
  <img src="src-tauri/icons/128x128.png" width="96" height="96" alt="Typelite icon">
</p>

<h1 align="center">Typelite</h1>

<p align="center"><b>Just say it.</b> Press a shortcut in any app, speak, and clean text lands where you're typing.</p>

<p align="center">
  Free and open source (MIT) · No account · No telemetry · Runs on your computer or your own servers
</p>

---

Typelite is a voice keyboard for macOS. It listens while you hold (or tap) a shortcut, turns your
speech into text, cleans it up (fillers out, self-corrections applied, punctuation in) and pastes
it into whatever field has focus. It can also translate what you say, or answer a question about
the text you've highlighted.

It is inspired by [Typeless](https://www.typeless.com/) and takes a different approach: everything
is open, the models can run entirely on your own hardware, and the way it handles languages is
something you (and the community) can shape.

## What makes Typelite different

### Language presets, and a router that picks the right one

Every language writes differently. Cantonese speakers mix English into almost every sentence and
use words that formal written Chinese doesn't have; British English spells things its own way.
Typelite lets each of your languages carry its own instructions:

- **Presets from a shared library.** Pick a preset for a language (for example *Cantonese (Hong
  Kong)*, *English*, *Mandarin (Taiwan)*) straight from this repository, preview the full text, and
  use it. Edit it if you like: your edits are kept, and updates are offered, never forced.
- **A prompt router.** When you dictate, Typelite works out which of your languages you spoke,
  from the language speech recognition detected plus hint words a preset carries (嘅, 咗, 唔…),
  and adds only that language's instructions. English dictation never gets Cantonese rules, and
  plain Mandarin doesn't either.
- **Community-driven.** Presets are small Markdown files. If you speak a language well, you can
  improve how Typelite writes it: see [Contributing a language preset](CONTRIBUTING.md#language-presets)
  and the [preset catalogue](presets/languages/README.md).

### Translate without leaving the keyboard

- **Up to three target languages**, in the order you choose.
- **Switch mid-sentence:** while you're speaking, press the Switch key (Shift by default) or click
  the language on the pill to change the target. The recording keeps going.
- **Clear keys:** the first key of the Translate shortcut stops, the Switch key switches. Your own
  bindings are respected everywhere, including the hints.
- **Highlight and translate:** select text, press Translate, and it's replaced by its translation.

### Built-in setup in one click

No servers to install. On Apple Silicon, Typelite can run both halves on your computer:

- **Speech recognition:** [whisper.cpp](https://github.com/ggml-org/whisper.cpp) runs inside the
  app (large-v3-turbo or small, chosen for your hardware).
- **AI polish:** [llama.cpp](https://github.com/ggml-org/llama.cpp)'s server ships with the app
  (Qwen3 4B or 1.7B).

Press **Set up**, watch the download, done. Models are checked against a SHA-256 before use.

### …or bring your own

Prefer a GPU computer on your network or a cloud key? Typelite talks to any **OpenAI-compatible**
speech or chat server (whisper.cpp server, Speaches, Ollama, LM Studio, OpenAI, Groq,
OpenRouter…) and to **Qwen Cloud**'s speech API. Cloud services are opt-in and use your own key:
nothing leaves your machines unless you choose one. See the [guides](docs/guides/README.md).

## How it compares with Typeless

|  | Typeless | Typelite |
|---|---|---|
| Source | Closed | Open source (MIT) |
| Price | Free tier and paid plans | Free |
| Account | Sign-in required | None |
| Where speech and AI run | The Typeless cloud | On your computer, your own server, or a cloud service you pick |
| Languages | Built in | Per-language presets from a public library, plus a router |
| Translate targets | Up to 3, switch from the pill | Up to 3, switch with a key or the pill while recording |

Typeless is a polished commercial product and a great source of ideas; Typelite is for people who
want to own the whole pipeline and tune it for their languages.

## Features at a glance

- **Dictate** (`Fn`): speak, get clean text pasted where you're typing.
- **Translate** (`Fn + Shift`): speak, get it written in another language.
- **Ask anything** (`Fn + Space`): ask a question, or highlight text and say "make this shorter".
  Answers appear in a small panel above the pill.
- **The pill** follows you to the screen you're working on and never steals focus. **Esc**
  cancels.
- **Nowhere to paste?** The result stays in the pill with a **Copy** button.
- **Insights:** how fast you speak compared with how fast you type, how long it usually takes from
  the end of your speech to the text, and how your presets compare.
- **Guided setup:** permissions, microphone, speech, AI, then a short hands-on tutorial.

All shortcuts are configurable, and hold-to-talk is available too.

## Get started

Typelite is macOS-first and runs best on Apple Silicon. There is no signed release yet, so build it
from source:

```bash
git clone https://github.com/sennett-lau/typelite.git
cd typelite
npm ci
npm run build:app          # builds llama-server, then the app bundle
open src-tauri/target/release/bundle/macos/Typelite.app
```

You'll need the Rust toolchain (pinned in `rust-toolchain.toml`), Node.js, the Xcode Command Line
Tools and CMake. Full details are in [CONTRIBUTING.md](CONTRIBUTING.md#setup).

## Documentation

| | |
|---|---|
| [Guides](docs/guides/README.md) | Choose a setup: built-in, your own server, or a cloud key |
| [Speech recognition](docs/guides/speech/README.md) | Connections and supported services |
| [AI polish](docs/guides/ai-polish/README.md) | Connections, services, thinking models |
| [Choosing a model](docs/guides/models.md) | Suggested models by hardware and language |
| [Languages](docs/guides/languages.md) | Translation languages, presets and recognition |
| [Benchmarks](docs/guides/benchmarks.md) | Reference numbers: an RTX 3080 Ti and an M1 Pro |
| [Preset catalogue](presets/languages/README.md) | Every language preset in the library |
| [Plans](docs/plans/README.md) | How features are designed before they're built |

## Privacy

- No accounts, no analytics, no telemetry.
- Typelite keeps no history of what you say. Insights keep only timings (durations, sizes, which
  presets were used) and, if you turn it on, a count of keystrokes, never which keys; **Settings →
  System → Clear insights data** deletes them.
- Logs (`~/Library/Logs/Typelite/typelite.log`) contain timings and errors, never your text.
- Audio goes only where you point it: the built-in models, your own server, or a service you chose.

## Contributing

Code, service cards, language presets and docs are all welcome. Start with
[CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE). Third-party components and models are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
