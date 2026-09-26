# Qwen Cloud speech

Qwen Cloud's speech model, `qwen-audio-3.0-asr-flash`, does not accept the OpenAI transcription
API, so Typelite has a separate connection for it. It is opt-in: it is used only when you enter
a Qwen Cloud address with your own key, and your audio is then sent to Qwen Cloud.

## Enter it

In **Your server or API key** (setup step or **Settings → Speech**), enter:

| Field | Value |
|---|---|
| Address | `https://token-plan.maas.qwencloudapi.com/api/v1` |
| Model | `qwen-audio-3.0-asr-flash` |
| API key | Your Qwen Cloud key (required) |

Press **Test**, then **Save**. The form shows "Qwen Cloud: sent to Qwen's own speech API" under
the fields.

- The console shows an address ending in `/compatible-mode/v1` next to your key. You can paste
  that too: Typelite changes it to `/api/v1` when you press Test or Save, because the speech
  model does not work on the compatible-mode address.
- Alibaba Model Studio (DashScope) addresses such as `https://dashscope-intl.aliyuncs.com/api/v1`
  use the same connection, but only the Token Plan address has been tested.

Getting a key: sign in to the Qwen Cloud console, subscribe to a **Token Plan**, create an API
key and copy it into Typelite with the address above.

## How Typelite recognises it

When you press Test or Save, the address decides the connection: a `*.qwencloudapi.com` or
`dashscope*.aliyuncs.com` host is saved as Qwen Cloud, every other address as OpenAI-compatible.
After that, the saved connection is used; nothing is guessed again while you dictate.

## The protocol

The recording is sent as a base64 WAV data URI inside a JSON body:

```
POST <address>/services/aigc/multimodal-generation/generation
Authorization: Bearer <API key>
Content-Type: application/json

{"model": "qwen-audio-3.0-asr-flash",
 "input": {"messages": [ … one user message with the audio … ]},
 "parameters": { … }}
```

- The service answers audio without speech with an empty `400 {}`; Typelite treats that as "no
  speech", not as an error. Test sends 0.1 s of silence and counts that answer as a pass.
- A wrong key gives `401` (`InvalidApiKey`), a wrong model `404` (`Model not exist.`).
- Server errors and timeouts are retried, and the same voice check as the other connections runs
  before upload.

## Limits and output

- **Recording limit:** at most 290 seconds (4 min 50 s), 4 minutes by default. Qwen returns
  nothing for audio over 5 minutes, which looks the same as silence, so **Settings → Speech →
  Recording** caps the limit while a Qwen Cloud preset is in use. Your longer choice is kept for
  other presets.
- **Languages:** leave the spoken language on auto-detect for mixed English, Mandarin and
  Cantonese. Chinese comes back in **Simplified characters**, and Cantonese as colloquial
  Cantonese in Simplified characters (for example `听日下昼三点开会得唔得`). AI polish and your
  [language settings](../languages.md) decide the final script.
