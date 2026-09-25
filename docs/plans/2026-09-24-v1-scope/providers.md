# Providers and presets

Speech and AI are configured as custom endpoints plus presets. Back to [index](index.md).

## Target

**Speech:** one provider type, an OpenAI-compatible transcription endpoint
(`POST {base}/audio/transcriptions`, multipart WAV, JSON `{"text": ...}`).

**AI:** one provider type, an OpenAI-compatible chat endpoint (`POST {base}/chat/completions`).

A **preset** is a named, saved set of values the user picks from a list:

| Field | Speech | AI |
|---|---|---|
| Name | yes | yes |
| Base URL | yes | yes |
| Model | yes | yes |
| API key (optional) | yes | yes |
| Language hint (or auto) | yes | – |
| Extra request fields | – | yes (for example `reasoning_effort: "none"` for thinking models) |

Built-in presets to start with:

| Preset | Type | Values |
|---|---|---|
| Local whisper.cpp (Mac) | Speech | `http://127.0.0.1:8178/v1`, large-v3-turbo, auto language |
| PC Ollama — Qwen3 4B Instruct | AI | `http://<pc-ip>:11434/v1`, `qwen3:4b-instruct-2507-q4_K_M` |

Later presets as we test models: Speaches on the PC, Qwen3-ASR on the PC, other Ollama models.

## Settings and onboarding

- Settings → Speech and Settings → AI each show a preset picker, the editable fields of the
  selected preset, a **Test** button, and "Save as new preset".
- Onboarding asks for one speech preset and one AI preset, with the built-ins preselected.

## Not supported

Hosted providers with their own APIs are not built in. Anything that speaks the OpenAI-compatible
API works through a preset (`whisper_compat.rs`, `llm/openai.rs`).

## Why

Fewer paths to test, and swapping models while we experiment becomes a settings change.
The "extra request fields" option also covers thinking models like Qwen3.5, which return empty
text unless thinking is turned off in the request.
