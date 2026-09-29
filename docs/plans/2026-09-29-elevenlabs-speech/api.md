# ElevenLabs speech-to-text API

What Typelite sends and expects, from the
[API reference](https://elevenlabs.io/docs/api-reference/speech-to-text/convert). Back to
[index.md](index.md).

## Request

```
POST https://api.elevenlabs.io/v1/speech-to-text
xi-api-key: <key>
Content-Type: multipart/form-data
```

| Field | Value |
|---|---|
| `file` | The recording as 16 kHz mono 16-bit WAV (`audio.wav`, `audio/wav`). At least 100 ms. |
| `model_id` | `scribe_v2` by default; the preset's model field, so other ids work. |
| `tag_audio_events` | Always `false`. |
| `language_code` | Only when the preset has a fixed language; ISO 639-1 or 639-3 are accepted. |

Other fields (`diarize`, `keyterms`, `timestamps_granularity`, webhooks, ...) are not sent.

## Response

```json
{"language_code": "eng", "language_probability": 0.98, "text": "Hello there.",
 "words": [...], "transcription_id": "..."}
```

- `text` is the transcript; it is tidied like every transcript (`stt/transcript.rs`). Empty
  text means no speech: nothing is pasted and the pill fades.
- `language_code` is ISO 639-3. A table in `stt/elevenlabs.rs` maps the common codes to ISO
  639-1 (`eng`→`en`, `cmn`/`zho`→`zh`, `jpn`→`ja`, ...); `yue` stays `yue`; an unknown
  three-letter code is passed on unchanged.
- `words` and the other fields are ignored.

## Errors

Errors carry `{"detail": {"status": "...", "message": "..."}}` (validation errors: `422` with a
`detail` list or text).

| Answer | Typelite |
|---|---|
| `401`/`403` | Invalid key (`stt_invalid_key`), with the service's message. |
| `detail.status == "quota_exceeded"` (any status) or `429` | Quota error (`stt_quota_exceeded`). |
| `5xx`, timeout | Retried twice (1 s, 2 s), then shown. |
| Other `4xx` | Shown with the status and the first 200 characters of the message. |
