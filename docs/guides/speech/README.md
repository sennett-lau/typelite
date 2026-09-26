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
or a cloud service is faster; see [Choosing a model](../models.md) and
[Benchmarks](../benchmarks.md).

## Services

Each row links to a card with setup steps. "Your network" means a server on another computer you
run; "Cloud" services need your own API key and receive your audio.

<!-- BEGIN GENERATED: speech-services -->
<!-- END GENERATED: speech-services -->

Other services that accept the OpenAI transcription API should work too: enter their address and
model. To add one to this list, see [Service cards](../../../CONTRIBUTING.md#service-cards).

## More

- [Troubleshooting](troubleshooting.md): Test fails, slow recognition, nothing pasted.
- [Sharing presets](../sharing-presets.md): export and import your speech presets.
- [Languages](../languages.md): the recognition language and hints.
