# Qwen Cloud ASR API

What the Qwen Cloud endpoint expects and returns, as probed on 2026-09-25. Back to [index](index.md).

## Request

`POST {base}/services/aigc/multimodal-generation/generation`, where `{base}` is
`https://token-plan.maas.qwencloudapi.com/api/v1`. Header `Authorization: Bearer <key>`,
JSON body:

```json
{
  "model": "qwen-audio-3.0-asr-flash",
  "input": {"messages": [{"role": "user", "content": [
    {"type": "input_audio", "input_audio": {"data": "data:audio/wav;base64,<WAV>"}}
  ]}]},
  "parameters": {"format": "wav", "sample_rate": "16000", "language": "zh"}
}
```

- `"type": "input_audio"` and `parameters.format` are required. Without them every request gets
  an empty `400 {}`, the same answer as silence.
- `language` is optional. Left out, the model detects the language. The endpoint accepts any code
  without error, so Typelite sends the preset's language as it is, or nothing for auto.

## Response

`200` with the transcript in `output.text` (also top-level `text`, and `output.sentence.text`).
Several sentences still come back as one `output.sentence` object whose text holds all of them.
Word timings and `usage.duration` (seconds) are also returned; Typelite reads only the text.

## Errors

| Case | Answer |
|---|---|
| Silence or a pure tone | `400` with body `{}` |
| Audio longer than 5 minutes | `400` with an empty transcript and no error code |
| Wrong key | `401`, `code: InvalidApiKey` |
| Unknown model | `404`, `message: Model not exist.` |
| Wrong path | `400`, `code: InvalidParameter`, "url error" |

## Size

Tested with real speech: 3, 4 and 5 minutes (12.8 MB request body) succeed in 16–24 s.
Longer audio fails as in the table above.
