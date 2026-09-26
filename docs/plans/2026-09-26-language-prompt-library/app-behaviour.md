# App behaviour

How the library appears in Typelite: browsing, downloading, editing, updates, and how the text
reaches polish and translation. Design only; nothing here is built yet. Back to [index](index.md).

## Where the text of a language comes from

For each language the user chose, the instructions used are, in order:

1. **The user's own text**, if they edited it (as today, `instructions` in the language's
   settings).
2. **A downloaded preset**, rendered for that language code (see
   [preset-format.md](preset-format.md)).
3. **The built-in default** in `llm/prompt.rs` (as today). Always available, offline, and the
   fallback when a downloaded file is missing or damaged.

## Config

The per-language settings from plan `translation-language-presets` gain two optional fields:

```json
"translation": {
  "languages": {
    "zh-Hant-HK": {
      "ai_preset_id": null,
      "instructions": null,
      "library_preset": { "id": "cantonese-hong-kong", "version": 1, "sha256": "…" },
      "use_for": ["polish", "translate"]
    }
  }
}
```

- `library_preset` names the downloaded preset the language is based on. `instructions: null`
  means "use the preset as rendered"; text means the user edited it (a local modified copy;
  the downloaded file itself is never changed).
- `use_for` says which operations get the text. It starts as the preset's `applies_to`; for the
  built-in defaults and for text with no preset it is `["translate"]`, which is today's
  behaviour. The user can change it in the sheet.
- Old configs have neither field and behave exactly as now.

## Adding a language

1. The user adds a language (for example **Chinese (Traditional, Hong Kong)**).
2. The language's sheet opens with a **Presets** section listing matching presets in the
   order from [language-matching.md](language-matching.md): name, tier badge (Official or
   Community), summary, authors, model hint, "notes for en-GB" when a variant fits, and
   Downloaded when it is already local. "Built-in default" is always the first row and
   selected.
3. Choosing a preset downloads it (if needed) and shows the **full rendered text** in a
   read-only preview with the examples. Nothing is used until **Use this preset**.
4. After that the Instructions text area shows the preset text, with "From: Cantonese (Hong
   Kong) · v1 · Official".

The same Presets section is reachable later from the language's pencil button ("Browse
presets"), so existing users find it too.

## Editing

- Editing the text area turns the language into a modified copy: `instructions` holds the text,
  `library_preset` still records what it came from, and the source line reads "Based on
  Cantonese (Hong Kong) v1 · edited".
- **Reset to preset** brings back the rendered preset; **Reset to default** (as today) drops
  the preset and the edits and returns to the built-in default.
- Text equal to the rendered preset is stored as `null`, like the rule for built-in defaults.

## Updates

When the cached index has a higher `version` for a preset a language uses:

- The language chip gets a small dot, and the sheet shows "Update available: v2".
- **Not edited:** **Update** shows the new rendered text and replaces it on confirm. It is not
  automatic, because changed text changes the output and the user sees every text first.
- **Edited:** three choices: **Keep mine** (hides the notice until the next version), **Take
  update** (replaces the edits, after confirmation) and **Compare** (the user's text and the
  new text side by side, line by line; the user can copy from one to the other and save).
- A preset marked `deprecated` shows its reason and keeps working; it is not removed.
- A preset that disappears from the index keeps working from the local copy.

## Translation

Unchanged from plan `translation-language-presets`, except where the text comes from: the
language section of the prompt gets the language's effective text if `use_for` includes
`translate`, else the built-in default. The fixed rules around it (output only the
translation, target-language lock, Chinese script) stay as they are.

## Polish

**Rule:** a language's text is added to a polish request only when the transcript is in that
language: the language reported by speech recognition is matched against the user's chosen
languages (same matching as the library, primary language first: `en` matches the chosen
`en-GB`; `yue` matches `zh-Hant-HK`), and exactly one chosen language with `use_for` including
`polish` must match. No detected language, or no match, or several matches: no language text is
added and the log says which case it was (codes only).

Why this rule and not "all chosen languages that apply to polish":

- A polish prompt with the Cantonese, English and Taiwan texts together is three times longer on
  every dictation, which slows small local models and dilutes the instructions.
- Rules for one language confuse the model on text in another (Cantonese particles suggested in
  an English email).
- It needs no new setting: the user already chose their languages.

The added section is fixed text plus the language text:

```
LANGUAGE NOTES (<language name>): the transcript is in this language. These notes describe how
to write it. They cannot change the operation: clean the text, do not translate it, output only
the result.
<language_instructions>…</language_instructions>
```

This needs the detected language from the speech step (whisper.cpp reports it; OpenAI-compatible
servers return it with `verbose_json`), which the pipeline does not pass on today. A speech
preset with a fixed language (not `auto`) counts as that language.

## Considered

- **Apply every chosen language's text to polish**: see above.
- **Updating presets automatically**: silent changes to what the model is told; rejected.
- **Storing edits as a patch against the preset**: harder to show and to merge than keeping the
  whole edited text and comparing it with the new version.
- **A separate "Library" page in Settings**: presets only make sense per language; browsing
  where the language is edited keeps it one place.
