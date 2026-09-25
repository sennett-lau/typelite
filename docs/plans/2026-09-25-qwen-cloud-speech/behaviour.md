# Behaviour

How the Qwen Cloud service looks and behaves in Typelite. Back to [index](index.md).

## Setup form

Qwen Cloud is set up in the "Your server or API key" form of plan `two-tab-speech`
([layout](../2026-09-25-two-tab-speech/layout.md)), in onboarding and in Settings → Speech.
There is no template and no service picker.

- The user enters the Address (`https://token-plan.maas.qwencloudapi.com/api/v1`, or the
  `.../compatible-mode/v1` address Qwen shows next to the key), the Model
  (`qwen-audio-3.0-asr-flash`) and the API key. Name fills itself with the host.
- While the address is a Qwen host, one line under the fields says the recording goes to Qwen's
  own speech API and is limited to 4 min 50 s.
- Test and Save set the kind from the address: `qwen_cloud` for a Qwen host, otherwise
  `openai_compatible` (so changing the address to another service switches back). A
  compatible-mode address is rewritten to `.../api/v1` at the same time and the field shows it.
- The saved presets list and the Settings picker show the preset like any other (its name, the
  host by default). From then on everything follows the saved kind.
- The language row (Settings → Speech) is passed to Qwen as a hint; auto sends none.

## Provider

- Buffers the recording like the other providers and uploads it when recording stops.
- Skips silent recordings before any request (`stt/silence.rs`), like every speech provider.
- Treats an empty `400 {}` (or a result with only result fields and no text) as "no speech", so
  a quiet recording that passes the local silence check does not show an error.
- Retries `5xx` answers and timeouts twice (1 s, 2 s). Other errors show at once with the
  service's message.
- Times out after 60 s. A 5-minute recording takes about 25 s.
- Logs endpoint, status, duration and transcript length, never the text, the audio or the key.
- Notes upload start and end for the Speed board, like the OpenAI-compatible uploader.

## Recording limit

The limit follows the speech preset in use, which is the one shown in Settings → Speech (a
preset becomes the one in use when it is picked or saved). Qwen Cloud presets get a recommended limit of 4
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

Audio goes to Qwen Cloud only when the user saves a Qwen address with their key. The key is
stored in the macOS Keychain like other keys. The speech services guide lists Qwen Cloud with
the other cloud services and says that cloud services receive the recordings.

## Tests

- Unit tests: request body, address rewriting, response parsing, the `400 {}` rule, the kind's
  serde name, the recording limit per kind, provider dispatch, the kind chosen from the address,
  and the form testing and saving a Qwen address as `qwen_cloud`.
- End-to-end (`src-tauri/tests/e2e_services.rs`): English and Cantonese speech from macOS `say`
  against the real service, run only when `TYPELITE_E2E_QWEN_KEY` is set.
