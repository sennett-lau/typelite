<p align="center">
  <img src="src-tauri/icons/128x128.png" width="96" height="96" alt="Typelite icon">
</p>

<h1 align="center">Typelite</h1>

<p align="center"><b>Just say it.</b> Press a shortcut in any app, speak, and clean text lands where you're typing.</p>

<p align="center">
  Free and open source (MIT) · No account · No telemetry · Runs on your computer or your own servers
</p>

<!--
  Hero image or GIF. Uncomment when the file exists (see docs/media/README.md).

<p align="center">
  <img src="docs/media/pill-dictate.gif" width="800" alt="Typelite's pill dictating into a text field">
</p>
-->

Typelite is a voice keyboard for macOS. Hold or tap a shortcut and speak. Typelite turns your
speech into text, removes fillers, applies your self-corrections, adds punctuation and pastes the
result where you are typing. It can also translate what you say, or answer a question about the
text you have highlighted.

## Quick start

### Download

Get the DMG for Apple Silicon from [Releases](https://github.com/sennett-lau/typelite/releases).
The first release is coming soon. Until then, build it from source.

### Build from source

You need Rust ([rustup](https://rustup.rs/)), Node.js 20 or later, the Xcode Command Line Tools
and CMake.

```bash
git clone https://github.com/sennett-lau/typelite.git
cd typelite
npm ci
npm run build:app      # builds llama-server, then the app
open src-tauri/target/release/bundle/macos/Typelite.app
```

More detail is in the [Contributing guide](CONTRIBUTING.md#setup).

### First launch

1. Downloaded builds are not signed by Apple yet, so macOS blocks the first launch. Right-click
   Typelite.app and choose **Open** (on macOS 15 and later: **System Settings → Privacy &
   Security → Open Anyway**), or run `xattr -dr com.apple.quarantine /Applications/Typelite.app`
   once.
2. Allow **Microphone** and **Accessibility** when macOS asks. Accessibility lets Typelite paste.
3. Follow the guided setup: microphone, speech, AI, then a short hands-on tutorial.

Typelite is macOS first and runs best on Apple Silicon.

## What makes Typelite different

### Language presets and a router

Each of your languages can carry its own writing instructions. Pick a preset (for example
Cantonese (Hong Kong), English or Mandarin (Taiwan)) from the shared
[preset catalogue](presets/languages/README.md). Your edits are kept, and updates are offered,
never forced.

When you dictate, the router works out which language you spoke. It uses the language that speech
recognition detected, plus hint words a preset carries, such as Cantonese particles. Only that
language's instructions are added, so English dictation never gets Cantonese rules.

Presets are small Markdown files. If you speak a language well, you can improve them: see
[Contributing a language preset](CONTRIBUTING.md#language-presets).

### Translate with quick language switching

Choose up to three target languages. While you speak, press the Switch key (⇧ Shift by default) or
click the language name on the pill to change the target. The recording keeps going. Highlight
text and press Translate to replace it with its translation.

### Built-in setup in one click

On Apple Silicon, both halves can run on your computer with nothing else to install.
[whisper.cpp](https://github.com/ggml-org/whisper.cpp) handles speech recognition inside the app,
and [llama.cpp](https://github.com/ggml-org/llama.cpp)'s server handles AI polish. Press
**Set up** and Typelite picks models that suit your hardware, downloads them and checks each
download against a SHA-256.

### Bring your own server or key

Prefer a GPU computer on your network or a cloud key? Typelite works with any OpenAI-compatible
speech or chat server (whisper.cpp server, Speaches, Ollama, LM Studio, OpenAI, Groq, OpenRouter
and more) and with Qwen Cloud's speech API. Cloud services are opt-in and use your own key. See
the [Guides](docs/guides/README.md).

## How it compares with Typeless

Typelite is inspired by [Typeless](https://www.typeless.com/), a polished commercial product.

|  | Typeless | Typelite |
|---|---|---|
| Source | Closed | Open source (MIT) |
| Price | Free tier and paid plans | Free |
| Account | Sign-in required | None |
| Where speech and AI run | The Typeless cloud | Your computer, your own server, or a cloud service you pick |
| Languages | Built in | Presets from a public library, plus a router |
| Translate targets | Up to 3, switch from the pill | Up to 3, switch with a key or the pill while recording |

## Features

| Feature | What it does | Default keys |
|---|---|---|
| Dictate | Speak, and clean text is pasted where you are typing. | Fn |
| Translate | Speak, and it is written in another language. | Fn + ⇧ |
| Ask anything | Ask a question, or highlight text and say "make this shorter". Answers show in a panel above the pill. | Fn + Space |
| Switch language | Change the translation target while you speak. | ⇧ |
| Cancel | Stop the current recording or processing. Nothing is pasted. | esc |
| The pill | Shows recording, transcribing and polishing on the screen you are working on. It never takes focus. | |
| Copy pill | When there is nowhere to paste, the result stays in the pill with a Copy button. | |
| Presets | Save several speech and AI setups, switch between them, and export or import them. | |
| Insights | Your speaking speed against your typing speed, time from speech to text, and how your presets compare. | |
| Typing nudge | After a minute of steady typing, a small hint suggests saying it instead. At most once a day. | |

Keys are shown as macOS menus show them (⇧ is Shift). Every shortcut can be changed, and
hold-to-talk is available too.

## Documentation

| Document | Covers |
|---|---|
| [Guides](docs/guides/README.md) | Choose a setup: built-in, your own server, or a cloud key |
| [Speech recognition](docs/guides/speech/README.md) | Connections and supported services |
| [AI polish](docs/guides/ai-polish/README.md) | Connections, services and thinking models |
| [Choosing a model](docs/guides/models.md) | Suggested models by hardware and language |
| [Languages](docs/guides/languages.md) | Translation languages, presets and recognition |
| [Sharing presets](docs/guides/sharing-presets.md) | Export and import your speech and AI presets |
| [Benchmarks](docs/guides/benchmarks.md) | Reference numbers on an NVIDIA GPU and on Apple Silicon |
| [Preset catalogue](presets/languages/README.md) | Every language preset in the library |
| [Plans](docs/plans/README.md) | How features are designed before they are built |
| [Releasing](docs/releasing.md) | How maintainers cut a release |

## Privacy

- No accounts, no analytics, no telemetry.
- No history of what you say. Insights keep only timings and a keystroke count (never which keys).
  You can turn typing measurement off, and **Settings → System → Clear insights data** deletes them.
- Logs (`~/Library/Logs/Typelite/typelite.log`) hold timings and errors, never your text.
- Audio goes only where you point it: the built-in models, your own server, or a service you chose.

## Contributing

Code, service cards, language presets and docs are all welcome. Start with the
[Contributing guide](CONTRIBUTING.md).

## Licence

[MIT](LICENSE). Third-party components and models are listed in the
[Third-party notices](THIRD_PARTY_NOTICES.md).
