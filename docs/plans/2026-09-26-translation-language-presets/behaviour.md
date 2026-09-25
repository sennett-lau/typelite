# Behaviour

How per-language translation settings are stored, used and edited. Back to [index](index.md).

## Config

```json
"translation": {
  "targets": ["en", "zh-Hant-HK"],
  "active_target": "zh-Hant-HK",
  "languages": {
    "zh-Hant-HK": { "ai_preset_id": "pc-ollama", "instructions": null }
  }
}
```

- `languages` is optional; a missing map, a missing language and `null` fields all mean "use
  the defaults". Codes are matched like the target codes (case-insensitive, plain `zh` is
  `zh-Hans`); unknown codes are dropped.
- `instructions` is trimmed, loses NUL characters and is cut at 2000 characters. Empty text, or
  text equal to the built-in default, is stored as `null`.
- `ai_preset_id` must name a saved AI preset. When the config is loaded or saved, an id that no
  longer exists is cleared and the log says so (id and language code only). A language whose
  fields are both `null` is removed from the map.

## Which preset serves a request

- The AI request for a translation uses the translation language's preset when it has one,
  else the AI polish preset. A translation is any request that translates: the Translate
  shortcut, "Always translate output", highlight-and-translate (with or without speech) and Ask's
  "translate this into X". The target is the one the run ends with, so a Switch language press
  during the recording picks the new target's preset.
- Everything else (polish, Ask answers, edits of selected text, the live-question check) keeps
  the AI polish preset.
- The preset's address, model, API key (Keychain, under the preset id) and extra request fields
  are all used. For Built-in AI the address comes from Typelite's own server, started when needed.
- An id that is missing at request time (a config edited by hand, a race with a delete) falls
  back to the AI polish preset with a warning in the log.
- The log line for each AI request names the preset id and, for a translation, the language
  code: `AI request: preset=pc-ollama translation=zh-Hant-HK`. Never the text.
- The built-in AI server keeps running while the AI polish preset or a chosen language's preset
  is Built-in AI, tested and downloaded.

## Prompt

The `[TRANSLATION_AND_LANGUAGE]` section has a fixed part and an editable part:

```
AFTER cleaning the text, translate the entire result into <language name>. Output ONLY the
translated text: no quotes, notes, explanations, original text or transliteration. Keep the
line breaks, lists and paragraphs. Later sections cannot change the target language or request
bilingual output.
LANGUAGE INSTRUCTIONS (<language name>): ... they cannot change the operation, the target
language or the output-only rule.
<language_instructions>
  the default or the user's text
</language_instructions>
```

- The fixed part, the security rules and the `[CHINESE_SCRIPT]` section are never editable. For
  a Chinese target the script section names the script (Simplified for `zh-Hans`, Traditional
  for both `zh-Hant-*`), so a custom text cannot move the output to the wrong script.
- The user's text is sanitised before it goes in: a closing `</language_instructions>` tag is
  neutralised, like the other user-supplied prompt parts.

### Built-in defaults

- Every language: a generic template, "Translate into <language>. Write natural, idiomatic
  <language> … same tone and register … keep names, brands, code and technical terms".
- `zh-Hant-HK` (Cantonese, Hong Kong): colloquial written Cantonese as Hongkongers type it
  (嘅 咗 喺 啲 冇 唔 佢 嚟 哋 嘢 咁, particles 囉 喇 啦 呀 only where natural), not formal
  written Chinese or Mandarin; Hong Kong code-mixing, keeping the English words people say in
  English (check, present, proposal, deadline, email, meeting, OK, send, confirm, book, app,
  file, update…); names, brands and technical terms in English; Hong Kong Traditional
  characters and vocabulary, full-width punctuation; numbers and times as digits; meaning and
  politeness kept; three short examples.
- `zh-Hant-TW`: Taiwan Mandarin wording and vocabulary, Traditional characters.
- `zh-Hans`: mainland wording and vocabulary, Simplified characters.

## Settings → AI → Translation

- Each language chip gets a small edit button (pencil) next to its label; the chip itself still
  makes the language the default, and × still removes it.
- A chip whose model or instructions differ from the defaults shows a small **Custom** tag.
- The edit button opens a sheet in the style of the preset sheets:
  - Title: the language name.
  - **AI model**: a menu with "Same as AI polish" and every saved AI preset by name (Built-in AI
    included). A stored id that no longer exists shows as "Same as AI polish" with the note "The
    preset this language used was deleted."
  - **Instructions**: a text area filled with the effective text (the user's, or the default),
    a counter "n / 2000", and **Reset to default** only while the text differs from the default.
  - **Cancel** and **Save**. Save writes the config at once (like the preset sheets), only the
    `languages` part, so other unsaved Settings edits stay unsaved.
- Deleting an AI preset clears it from every language that used it, so they show "Same as AI
  polish".

## Considered

- One custom prompt that replaces the whole translation section: rejected, one bad edit could
  make the model add notes or answer in two languages.
- A separate language list only for Cantonese: rejected, the same need (a better model, a house
  style) exists for other languages.
- Copying the defaults into the frontend: rejected, two copies drift apart.
