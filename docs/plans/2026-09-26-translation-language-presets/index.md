# Translation language presets

Each translation language can have its own AI model and its own instructions. A Cantonese
speaker can send translations into Hong Kong Chinese to a model that writes colloquial Cantonese
with Hong Kong code-mixing ("你可唔可以幫我check下個proposal嘅deadline？"), while English and
the other languages keep the AI polish model and a plain, natural translation. Every language
ships with sensible built-in instructions, so nothing needs to be set up.

Status: building — 2026-09-26

Changes one decision in [translate-controls](../2026-09-25-translate-controls/index.md): the
Hong Kong variant (`zh-Hant-HK`) now translates into written Cantonese as Hongkongers type it,
not into formal written Chinese. Users who want formal written Chinese edit its instructions.

## Goals

- Per translation language: pick the AI model ("Same as AI polish", or any saved AI preset,
  including Built-in AI) and edit the language-specific instructions.
- A good built-in default for every language, with specific ones for the three Chinese variants;
  the Cantonese one follows how Hong Kong people actually write.
- An edited prompt can never break the output: the output contract stays in code.
- Every translation path uses the language's settings: spoken Translate, "Always translate
  output", highlight-and-translate, and Ask's translate operations.

## Non-goals

- Per-language settings for polish without translation (it is unchanged).
- Sharing language settings in the preset file (plan `preset-sharing`); presets are shared,
  language settings are not.
- More than three languages, or new language codes.

## Key decisions

| Decision | Reason |
|---|---|
| Stored as `translation.languages`, a map from language code to `{ ai_preset_id, instructions }`, both optional (absent = default) | Old configs need no migration step; defaults stay in code and improve with updates. |
| Settings are kept for a language after it is removed from the chosen list | Removing and adding a language back does not lose the user's work. |
| A preset id that no longer exists falls back to the AI polish preset, and is dropped when the config is saved, with a log line | Deleting a preset can never break translation; the UI shows "Same as AI polish" again. |
| The preset is picked when the AI request is built, from the final target of the run | The Switch language key during a recording picks the new target's model with no extra state. |
| Readiness (can Translate start?) still checks the AI polish preset | One rule for all features; a language preset that fails shows the usual AI error. |
| Built-in AI also stays running when a chosen language uses it | Otherwise the first translation into that language waits for the server to start. |
| The editable part is only the language section of the prompt; the operation, "output only the translation", line breaks, the target-language lock and the Chinese script rule stay in code around it | A user edit (or a bad paste) cannot make the model add notes, quotes or bilingual output. |
| Limit 2000 characters, like the custom polish instructions | Same rule users already know; keeps the prompt small for 4B models. |
| Text equal to the built-in default is stored as "no custom text" | "Custom" means the user really changed something, and later default improvements still reach them. |
| Defaults come from the backend through one command, not copied into the frontend | One source for the prompt text and the Settings prefill. |
| Logs name the preset id and the language code of each translation, never the text | Same privacy rule as the rest of the log. |

## Parts

| File | Covers |
|---|---|
| [behaviour.md](behaviour.md) | Config, preset resolution, prompt structure, the built-in defaults and the Settings sheet. |

## Open questions

- Whether the 4B built-in model follows the Cantonese instructions well enough, or whether the
  Hong Kong default should recommend a larger model. To check with more real sentences.
