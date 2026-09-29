# ElevenLabs speech

ElevenLabs' speech-to-text model, **Scribe** (`scribe_v2`), does not accept the OpenAI
transcription API, so Typelite has a separate connection for it. It is opt-in: it is used only
when you enter an ElevenLabs address with your own key, and your audio is then sent to
ElevenLabs.

## Enter it

In **Your server or API key** (setup step or **Settings → Speech**), enter:

| Field | Value |
|---|---|
| Address | `https://api.elevenlabs.io` |
| Model | `scribe_v2` (another Scribe model id also works) |
| API key | Your ElevenLabs API key (required) |

Press **Test**, then **Save**. Under the fields the form shows a tip with links to get a key, the
speech-to-text docs and the pricing. `https://api.elevenlabs.io/v1` and the full
`https://api.elevenlabs.io/v1/speech-to-text` work too.

To change or rotate the key later, open the preset in **Settings → Speech**, paste the new key
and press Save. Keys are kept in the macOS Keychain, never in the settings file.

## Getting a key

1. Sign up or sign in at [elevenlabs.io](https://elevenlabs.io).
2. Open [API keys](https://elevenlabs.io/app/settings/api-keys) (**Developers → API keys** in
   your profile menu) and create a key.
3. Give it the **Speech to Text** permission (a restricted key with only that permission is
   enough), then copy it into Typelite with the address above.

**Cost:** the free plan includes monthly credits that cover roughly 30 minutes of speech to
text; paid plans include more hours and bill Scribe at about $0.22 an hour. See
[ElevenLabs pricing](https://elevenlabs.io/pricing/api) for current numbers, and the
[speech to text docs](https://elevenlabs.io/docs/overview/capabilities/speech-to-text) for
models and languages. Typelite skips
recordings without speech before uploading, so key clicks are never billed.

## How Typelite recognises it

When you press Test or Save, the address decides the connection: an `elevenlabs.io` host (such
as `api.elevenlabs.io`) is saved as ElevenLabs, every other address as OpenAI-compatible. After
that, the saved connection is used; nothing is guessed again while you dictate.

## The protocol

```
POST <address>/v1/speech-to-text
xi-api-key: <API key>
Content-Type: multipart/form-data

file=<recording.wav>  model_id=scribe_v2  tag_audio_events=false  [language_code=<code>]
```

- `tag_audio_events=false` keeps tags such as "(laughter)" out of the pasted text.
- The spoken language is sent only when you choose one. On auto-detect Scribe detects it and
  answers with an ISO 639-3 code (`eng`, `cmn`, `yue`), which Typelite turns into its own codes
  (`en`, `zh`, `yue`) for your [language settings](../languages/README.md).
- A wrong key gives `401`; used-up credits (`quota_exceeded`) and too many requests (`429`) show
  as a quota error. Server errors and timeouts are retried, and the same voice check as the other
  connections runs before upload.

## Limits and output

- **Recording limit:** the app's usual limit (10 minutes by default); Scribe itself accepts much
  longer files.
- **Languages:** about 90, with auto-detect. AI polish and your
  [language settings](../languages/README.md) decide the final wording and Chinese script.
