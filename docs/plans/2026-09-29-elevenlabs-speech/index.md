# ElevenLabs speech

Adds ElevenLabs Scribe (`scribe_v2`) as a speech service the user can use with their own
ElevenLabs API key. Scribe does not speak the OpenAI transcription API (other path, other auth
header, other field names), so it gets its own speech provider kind, `elevenlabs`, next to the
OpenAI-compatible uploader, the built-in whisper.cpp and Qwen Cloud. Like Qwen Cloud it is not a
separate choice in the setup screens: the user enters it in the "Your server or API key" form and
the address decides the kind.

Status: building — 2026-09-29

Follows plan [qwen-cloud-speech](../2026-09-25-qwen-cloud-speech/index.md) in every shared
decision (address decides the kind, opt-in with the user's key, key in the Keychain, same voice
check and hallucination guard). It changes none of that plan's decisions.

## Goals

- A user with an ElevenLabs key chooses "Your server or API key", enters
  `https://api.elevenlabs.io`, `scribe_v2` and the key, presses Test, and dictates.
- The language Scribe detects reaches the polish router like whisper's and Qwen3-ASR's does.
- Same behaviour as other speech presets: silence skipped before upload (nothing billed),
  retries on server errors, upload timing on the Speed board, key rotation in Settings.

## Non-goals

- Scribe Realtime (WebSocket streaming). Recordings are uploaded when they end.
- Diarisation, key terms, entity detection or word timestamps. Typelite needs only the text.
- ElevenLabs text-to-speech or any other ElevenLabs product.
- A template, menu entry or bundled key. The service is documented in the speech guide.

## Key decisions

| Decision | Reason |
|---|---|
| New speech kind `elevenlabs` with its own uploader (`stt/elevenlabs.rs`) | `POST /v1/speech-to-text` with `xi-api-key` and `model_id` is not the OpenAI API. |
| Kind follows from the address on Test or Save: any `elevenlabs.io` host gives `elevenlabs` | One form for every service, as in plan `qwen-cloud-speech`; regional hosts work too. |
| The address may be the host, `.../v1` or the full endpoint; the uploader adds what is missing | Users paste what the docs show. |
| Always send `tag_audio_events=false` | Otherwise "(laughter)" and similar tags would be pasted. |
| Send `language_code` only for a fixed language | Auto-detect is Scribe's default and handles mixed speech. |
| Map `language_code` (ISO 639-3) to Typelite's short codes (`eng`→`en`, `cmn`→`zh`, `yue`) | The polish router and Insights use ISO 639-1 codes and `yue`. |
| 401/403 → invalid key; `quota_exceeded` or 429 → quota error; 5xx and timeouts retried twice | Users see the same messages as for other services. |
| Normal client upload limit (the app's usual recording limit), no service cap | Scribe accepts files far larger than any dictation. |
| Presets of this kind are shared by export/import, keys only when the user ticks it | Same as Qwen Cloud. |
| Test sends 0.5 s of silence; any 2xx passes | Scribe answers silence with empty text; a bad key still fails with its message. |

## Parts

| File | Covers |
|---|---|
| [api.md](api.md) | Endpoint, request, response and errors, from the ElevenLabs API reference. |
| [behaviour.md](behaviour.md) | Form, provider behaviour, language flow, privacy, tests and docs. |

## Open questions

- The request and response were taken from the API reference; no live call has been made yet.
  The ignored e2e tests (`TYPELITE_E2E_ELEVENLABS_KEY`) confirm them once a key is available.
- The exact error bodies for a bad key, used-up credits and rate limits are assumed from
  ElevenLabs' general error format (`{"detail": {"status", "message"}}`).
- How Scribe writes Cantonese (Traditional, Simplified, colloquial or formal) is not measured.
