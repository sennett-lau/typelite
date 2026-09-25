# Behaviour

How the Qwen Cloud service looks and behaves in Typelite. Back to [index](index.md).

## Settings and onboarding

The speech type picker reads **Built-in (this Mac) · Local server · Cloud service**. Cloud service
has the services **OpenAI · Groq · Qwen Cloud · Custom**. Qwen Cloud shows the API key and the
model, like OpenAI and Groq; its address is fixed by the template. The language row (Settings
only) is passed to Qwen as a hint.

The service follows from the preset's kind (`qwen_cloud`), not from its address, so a custom
Qwen address still shows as Qwen Cloud.

## Provider

- Buffers the recording like the other providers and uploads it when recording stops.
- Skips silent recordings before any request (`stt/silence.rs`), like every speech provider.
- Treats an empty `400 {}` (or a result with only result fields and no text) as "no speech", so a quiet recording that passes the local silence
  check does not show an error.
- Retries `5xx` answers and timeouts twice (1 s, 2 s). Other errors show at once with the
  service's message.
- Times out after 60 s. A 5-minute recording takes about 25 s.
- Logs endpoint, status, duration and transcript length, never the text, the audio or the key.
- Notes upload start and end for the Speed board, like the OpenAI-compatible uploader.

## Recording limit

The limit follows the active speech preset. Qwen Cloud presets get a recommended limit of 4
minutes and a hard limit of 290 s (a longer custom limit is cut to it while Qwen Cloud is active,
but the saved choice is kept for other presets), with the reason "Limited by
this service's maximum audio length." Other presets keep the local buffer limit from before.
The provider buffers up to 300 s, so the last chunks after the limit still fit, and refuses
anything longer.

## Test

Test sends 0.1 s of silence with the preset's key. `2xx` or an empty `400 {}` counts as a pass and
shows the time. Anything else shows the HTTP status and the service's message. Because a silent
clip cannot prove the request format, the end-to-end tests also send real speech (see below).

## Privacy

Audio goes to Qwen Cloud only when the user picks this service and enters their key. The key is
stored in the macOS Keychain like other keys. The setup guide's cloud line says recordings are
sent to the chosen service.

## Tests

- Unit tests: request body, address rewriting, response parsing, the `400 {}` rule, the kind's
  serde name, the recording limit per kind, provider dispatch.
- End-to-end (`src-tauri/tests/e2e_services.rs`): English and Cantonese speech from macOS `say`
  against the real service, run only when `TYPELITE_E2E_QWEN_KEY` is set.
