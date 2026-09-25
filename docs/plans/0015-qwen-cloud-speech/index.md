# 0015 — Qwen Cloud speech

Adds Qwen Cloud's `qwen-audio-3.0-asr-flash` as a speech service the user can pick with their own
Qwen Cloud Token Plan key. The model does not speak the OpenAI transcription API, so it gets its
own speech provider type next to the OpenAI-compatible uploader and the built-in whisper.cpp.

Status: building — 2026-09-25

Supersedes the "Hosted providers with their own APIs are not built in" rule in
[0002](../0002-v1-scope/index.md) (`providers.md`) for this one service, and renames the third
speech type from [0014](../0014-concise-speech-setup/index.md) from "OpenAI-compatible" to
"Cloud service", because it now holds a service that is not OpenAI-compatible.

## Goals

- A user with a Qwen Cloud Token Plan key picks Cloud service → Qwen Cloud, pastes the key,
  presses Test, and dictates. Mixed English, Mandarin and Cantonese work without a fixed language.
- The same behaviour as other speech presets: silence skipped before upload, retries on server
  errors, upload timing on the Speed board, recording limit shown in Settings.

## Non-goals

- Qwen's streaming or realtime models (WebSocket). Recordings are uploaded when they end.
- Qwen models for AI polish. Those already work through the OpenAI-compatible AI presets.
- Other hosted speech APIs with their own formats.

## Key decisions

| Decision | Reason |
|---|---|
| New speech provider kind `qwen_cloud`, with its own uploader | The model only answers on Qwen's native multimodal endpoint, not on `/audio/transcriptions` or `/chat/completions`. |
| Opt-in only, with the user's own key; never a default and never chosen by Quick setup | Audio leaves the Mac. Same terms as the existing OpenAI and Groq services. |
| Shown as a service ("Qwen Cloud") inside the third speech type, renamed "Cloud service" | One place for "a hosted service with my key"; the name "OpenAI-compatible" would be wrong for it. |
| Template address `https://token-plan.maas.qwencloudapi.com/api/v1`, model `qwen-audio-3.0-asr-flash`, both hidden like OpenAI and Groq | The user only needs the key. |
| A pasted `.../compatible-mode/v1` address is rewritten to `.../api/v1` | That is the address Qwen shows for the key, but the speech model does not work there. |
| Recording limit: recommended 4 minutes, hard limit 290 s | Probed: 300 s works; 330 s gets a `400` with empty text and no error code, which looks like silence. |
| Test sends 0.1 s of silence and counts an empty `400 {}` as a pass | That is how the endpoint answers audio without speech; a wrong key (`401`) or model (`404`) still fails with its message. |

## Parts

| File | Covers |
|---|---|
| [api.md](api.md) | Endpoint, request, response and error behaviour as probed. |
| [behaviour.md](behaviour.md) | Settings screens, provider behaviour, limits, privacy, tests. |

## Open questions

- Cantonese comes back as colloquial Cantonese in Simplified characters. Whether AI polish should
  convert it to Traditional is a polish setting, not part of this plan.
