# Adding a connection

A **connection** is one way Typelite reaches a speech or AI service. Each one is a provider kind
in the config:

| Side | Kind (config value) | Rust | What it does |
|---|---|---|---|
| Speech | `openai_compatible` (default) | `stt/whisper_compat.rs` | Uploads a WAV to `POST <address>/audio/transcriptions`. |
| Speech | `builtin` | `stt/builtin.rs` | Runs whisper.cpp in the app with a downloaded model. |
| Speech | `qwen_cloud` | `stt/qwen_cloud.rs` | Sends base64 audio to Qwen's native multimodal endpoint. |
| AI | `openai_compatible` (default) | `llm/openai.rs`, `llm/protocol.rs` | `POST <address>/chat/completions`. |
| AI | `builtin` | `llm/builtin.rs` | Starts `llama-server` and then talks to it like an OpenAI-compatible server. |

The kinds are `SpeechProviderKind` and `AiProviderKind` in `src-tauri/src/storage/mod.rs`.

Most services need **no new connection**: if a service speaks the OpenAI API, add a
[service card](../../CONTRIBUTING.md#service-cards) instead. Add a connection only when a
service needs its own protocol. That is a feature: write a plan first
(`docs/plans/YYYY-MM-DD-slug/`, see [docs/plans/README.md](../plans/README.md)).

This guide follows the Qwen Cloud speech connection (plan
[qwen-cloud-speech](../plans/2026-09-25-qwen-cloud-speech/index.md)) as the worked example.

## 1. Probe the service

Before writing code, find out exactly how the service behaves and write it down in the plan
(Qwen Cloud: [api.md](../plans/2026-09-25-qwen-cloud-speech/api.md)): the endpoint, the request
body, the answer, and the errors for a wrong key, a wrong model, silence and a too-long
recording. These cases become tests. Qwen answers silence with a bare `400 {}`, which is "no
speech", not an error; without the probe this would have looked like a failure.

## 2. The provider module

Add one Rust file for the protocol, next to the existing ones (`src-tauri/src/stt/qwen_cloud.rs`):

- A config struct built from a preset (`QwenCloudConfig`), with the full endpoint URL.
- A provider that implements the speech trait `SttProvider` in `stt/mod.rs` (`connect`,
  `send_audio`, `recv_transcript`, `disconnect`, `name`, and `set_upload_probe` for the Speed
  board). A file-based provider buffers audio in `send_audio` and uploads it in `disconnect`.
- The same safety steps as the other providers: the voice check in `stt/silence.rs` before
  upload (never send silence), the hallucination guard in `stt/hallucination.rs` after it, retries
  for server errors and timeouts, and timeouts for the request and for Test.
- A `check_connection` function for the Test button.
- Unit tests for request building, answer parsing and each probed error case, with no network.
- Never log the transcript or the audio; log sizes, status codes and durations.

For AI, a provider implements `LlmProvider` in `llm/mod.rs`. The Built-in AI shows another
pattern: it adds no protocol of its own, but resolves the preset to a running local server
(`llm/builtin.rs`, `endpoint_for`) and then uses the OpenAI-compatible code.

## 3. The config kind and migration

In `src-tauri/src/storage/mod.rs`:

- Add a variant to the kind enum. The enums use `#[serde(rename_all = "snake_case")]`, so
  `QwenCloud` is stored as `"qwen_cloud"`. Keep `OpenaiCompatible` as `#[default]`, so configs
  written before the kind existed still load.
- Add a constructor and a check (`SpeechPreset::qwen_cloud`, `is_qwen_cloud`).
- If existing configs must change (renamed fields, new defaults, dropped templates), add a
  migration in `AppConfig` and bump the version it keys on, with a test that loads an old
  config. Qwen Cloud needed none: it is a new kind, and old configs never hold it.
- Test that the kind round-trips through JSON.

Then pick the provider from the kind, in one place: `provider_for_preset` in `stt/mod.rs`. The
Test command (`commands/stt.rs`, `test_speech_preset`) and anything with per-service limits
(`stt/capabilities.rs`: Qwen's 290-second recording limit) branch on the saved kind too. Nothing
at dictation time should guess the kind from the address again.

## 4. Preset sharing

`storage/preset_share.rs` exports and imports presets. Decide whether the new kind is shared (Qwen
Cloud is, with its kind written into the file), make sure keys stay out unless the user ticks
**Include API keys**, and add a round-trip test. Older versions skip kinds they do not know.

## 5. The form

The setup screens have one **Your server or API key** form for every service; there is no
per-service menu. The frontend picks the kind from the address when the user presses Test or
Save:

- `src/lib/speechTypes.ts`: `isQwenCloudAddress` recognises the hosts, and `withServerKind`
  sets the kind (and rewrites a compatible-mode address to the native one).
- `src/components/Speech/services.ts`: `resolve` applies it before Test and Save, and
  `addressNote` shows one line under the fields for such an address.
- `src/stores/appStore.ts`: add the kind to the TypeScript `SpeechProviderKind` type.
- `src/i18n/locales/en.json` and `zh.json`: the note text, in both languages.
- Tests for the address detection and the form (`src/lib/__tests__/`,
  `src/components/Settings/__tests__/`).

## 6. End-to-end test

Add an optional test against the real service to `src-tauri/tests/e2e_services.rs`, skipped
unless its environment variables (address, key) are set, and describe them in the file.
`scripts/e2e.sh` runs these tests.

## 7. Docs

- A connection page under `docs/guides/speech/` or `docs/guides/ai-polish/` (see
  [qwen-cloud.md](../guides/speech/qwen-cloud.md)), and a row in the connections table of that
  folder's `README.md`.
- A service card with the new `connection` value, and the value added to `CARD_SETS` in
  `scripts/docs-cards.mjs`. Run `npm run docs:cards`.
- If the connection sends data to a cloud service, say so plainly: opt-in, with the user's own
  key.

## Checklist

- [ ] Plan written and agreed.
- [ ] Provider module with unit tests for every probed case; voice check and hallucination guard.
- [ ] Kind variant, constructor, round-trip test; migration only if old configs change.
- [ ] Provider, Test and limits branch on the saved kind.
- [ ] Preset sharing decided and tested.
- [ ] Form detection, note text in English and Chinese, frontend tests.
- [ ] Optional e2e test.
- [ ] Connection page, service card, `npm run docs:cards`.
- [ ] Offline gate passes (see [CONTRIBUTING.md](../../CONTRIBUTING.md#the-offline-gate)).
