# Qwen Cloud speech

Adds Qwen Cloud's `qwen-audio-3.0-asr-flash` as a speech service the user can use with their own
Qwen Cloud Token Plan key. The model does not speak the OpenAI transcription API, so it gets its
own speech provider kind, `qwen_cloud`, next to the OpenAI-compatible uploader and the built-in
whisper.cpp. In the setup screens it is not a separate choice: the user enters it in the
"Your server or API key" form like any other service, and the address decides the kind.

Status: building — 2026-09-25

Supersedes in part plan [v1-scope](../2026-09-24-v1-scope/index.md)'s "Hosted providers with
their own APIs are not built in" ([providers.md](../2026-09-24-v1-scope/providers.md)) for this
one service. Fits the two-engine speech setup of plan
[two-tab-speech](../2026-09-25-two-tab-speech/index.md) without changing its screens beyond one
note line in the form.

## Goals

- A user with a Qwen Cloud Token Plan key chooses "Your server or API key", enters the Qwen
  address, the model and the key, presses Test, and dictates. Mixed English, Mandarin and
  Cantonese work without a fixed language.
- The same behaviour as other speech presets: silence skipped before upload, retries on server
  errors, upload timing on the Speed board, recording limit shown in Settings.

## Non-goals

- Qwen's streaming or realtime models (WebSocket). Recordings are uploaded when they end.
- Qwen models for AI polish. Those already work through the OpenAI-compatible AI presets.
- Other hosted speech APIs with their own formats.
- A Qwen template, service chip or menu entry. Plan `two-tab-speech` has one form for every
  service; per-service setup lives in the speech services guide.

## Key decisions

| Decision | Reason |
|---|---|
| New speech provider kind `qwen_cloud`, with its own uploader | The model only answers on Qwen's native multimodal endpoint, not on `/audio/transcriptions` or `/chat/completions`. |
| The kind follows from the address when the user presses Test or Save: Qwen Cloud (`*.qwencloudapi.com`) and Model Studio (`dashscope*.aliyuncs.com`) hosts give `qwen_cloud`, every other address `openai_compatible` | One form for every service; the user does not need to know which API a service speaks. |
| After that, behaviour follows the saved kind, not the address | Provider, Test and recording limit read one field; nothing re-guesses at dictation time. |
| A `.../compatible-mode/v1` address is rewritten to `.../api/v1` when tested or saved, and the field shows the result | That is the address Qwen shows next to the key, but the speech model does not work there. |
| The form shows one plain line for a Qwen address ("sent to Qwen's own speech API", the length limit); the saved preset is named after its host like any other | Says what happens without adding a choice to the screen. |
| Opt-in only, with the user's own key; never a default and never chosen by the Built-in setup | Audio leaves the Mac. Same terms as OpenAI, Groq and the other cloud services. |
| Recording limit: recommended 4 minutes, hard limit 290 s, for the preset in use | Probed: 300 s works; 330 s gets a `400` with empty text and no error code, which looks like silence. |
| Test sends 0.1 s of silence and counts an empty `400 {}` as a pass | That is how the endpoint answers audio without speech; a wrong key (`401`) or model (`404`) still fails with its message. |
| Setup help (address, key, limit, Simplified output) goes in `docs/guides/speech-services.md` | The form's "Learn more" already opens that guide. |

## Parts

| File | Covers |
|---|---|
| [api.md](api.md) | Endpoint, request, response and error behaviour as probed. |
| [behaviour.md](behaviour.md) | Setup form, provider behaviour, limits, privacy, tests. |

## Open questions

- Cantonese comes back as colloquial Cantonese in Simplified characters. Whether AI polish should
  convert it to Traditional is a polish setting, not part of this plan.
- Only the Token Plan address was probed. Model Studio (DashScope) hosts are sent to the same
  native endpoint, but whether they take the same request body for their speech models is not
  tested.
