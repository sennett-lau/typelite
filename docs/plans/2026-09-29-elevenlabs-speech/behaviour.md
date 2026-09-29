# Behaviour

How the ElevenLabs connection fits the app. Back to [index.md](index.md).

## Form

- `isElevenLabsAddress` (`src/lib/speechTypes.ts`) is true for `elevenlabs.io` and any
  `*.elevenlabs.io` host. `withServerKind` then sets `kind: "elevenlabs"` on Test and Save;
  another address sets `openai_compatible` again.
- Under the Name field, above Test and Save, the form shows a tip for such an address
  (`ElevenLabsTip`, `speech.elevenLabsTip.*` in English and Chinese): the audio goes to ElevenLabs
  with the user's key, the key needs the Speech to Text permission, and links (opened in the
  browser) to get a key, the speech-to-text docs and the pricing. Settings and onboarding share
  the form, so both show it. The "Your server or API key" card names ElevenLabs. The preset is
  named after its host, like any other.
- The key is typed in the same API key field and stored in the Keychain under the preset id
  (`stt` namespace), exactly like other speech keys. Changing it clears the preset's "tested"
  mark until the next Test.

## Provider

- `provider_for_preset` picks `ElevenLabsProvider` for the `elevenlabs` kind. The Test command
  and preset sharing branch on the same kind.
- The provider buffers the recording and uploads it in `disconnect`, like the other uploaders.
- Before upload the shared voice check (`stt/silence.rs`) runs; audio without speech is never
  sent, so it is never billed. After recognition `accept_transcript` applies the hallucination
  guard (`stt/hallucination.rs`).
- The detected language is kept for `detected_language()`, which the pipeline hands to the
  polish router and records in run timings. Scribe's text is not treated as Qwen3-ASR output,
  so its Chinese script is left as it is.

## Privacy

Audio goes to ElevenLabs only when the user enters an ElevenLabs address and their own key. It
is never a default and never picked by the Built-in setup. The guide says so plainly.

## Tests

- Unit tests in `stt/elevenlabs.rs` with a local fake HTTP server: endpoint forms, the multipart
  fields and `xi-api-key` header on the wire, answer parsing, language-code mapping, error
  mapping (401, 403, quota, 429, 422), voice check, hallucination guard, Test command.
- Kind round-trip in `storage/mod.rs` and a share round-trip in `storage/preset_share.rs`.
- Frontend: address detection and a Settings form test.
- `tests/e2e_services.rs`: two ignored tests against the real API, run when
  `TYPELITE_E2E_ELEVENLABS_KEY` is set (`say`-synthesised English and Cantonese, silence, Test
  with a wrong key).

## Docs

`docs/guides/speech/elevenlabs.md` (enter it, getting a key, cost, protocol, limits), a row in
the Connections and Services tables of `docs/guides/speech/README.md`, and a line in the
troubleshooting table.
