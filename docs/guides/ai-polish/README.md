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
server on your network or a cloud key; see [Choosing a model](../models.md) and
[Benchmarks](../benchmarks.md).

## Services

Each row links to a card with setup steps and, where it matters, how to turn off thinking.

<!-- BEGIN GENERATED: ai-polish-services -->
<!-- END GENERATED: ai-polish-services -->

Other services with an OpenAI-compatible chat API should work too. To add one to this list, see
[Service cards](../../../CONTRIBUTING.md#service-cards).

## More

- [Choosing a model](../models.md): suggestions by hardware and by language.
- [Thinking models](thinking-models.md): why they are slow for polish and how to turn thinking off.
- [Languages](../languages.md): translation languages and per-language instructions.
- [Troubleshooting](troubleshooting.md): Test fails, empty answers, slow polish.
- [Sharing presets](../sharing-presets.md): export and import your AI presets.
