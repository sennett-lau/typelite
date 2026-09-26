# App behaviour

How the library appears in Typelite: the Settings rows, the language sheet, browsing and
previewing presets, updates, the config, and how the text reaches polish and translation. The
screens are in [mock.html](mock.html). Back to [index](index.md).

## Where the text of a language comes from

For each language the user chose, the instructions used are, in order:

1. **The user's own text**, if they edited it (`instructions` in the language's settings).
2. **A downloaded preset**, rendered for that language code (see
   [preset-format.md](preset-format.md)).
3. **The built-in default** in `llm/prompt.rs`. Always available, offline, and the fallback when
   a downloaded file is missing or damaged.

## Config

The per-language settings from plan `translation-language-presets` become:

```json
"translation": {
  "targets": ["zh-Hant-HK", "en"],
  "languages": {
    "zh-Hant-HK": {
      "instructions": null,
      "library_preset": { "id": "cantonese-hong-kong", "version": 2, "sha256": "…" },
      "enabled": true,
      "auto_update": false,
      "user_hints": ["得閒"]
    }
  }
}
```

- `instructions: null` means "use the preset as rendered" (or the built-in default without a
  preset); text means the user edited it. Text equal to the rendered preset, or to the built-in
  default without a preset, is stored as `null`.
- `library_preset` names the downloaded preset the language is based on, with the version and
  hash the user took. The downloaded file itself is never changed.
- `enabled` (default on): off means plain translation into the language and no notes in polish.
  The text is kept.
- `auto_update` (default off): see "Updates".
- `user_hints`: the user's own hint characters or words for the router, at most 40, each at most
  24 characters.
- **Migration:** `ai_preset_id` is dropped when the config is loaded, with one log line per
  language that had one. Old entries with only `instructions` keep working. An entry equal to the
  defaults is removed from the map.

## Settings → AI → Translation

- One **row per language**, in the saved order. Each row: a drag handle (⋮⋮), its number, the
  name, a grey line saying where its instructions come from, an on/off switch (saved at once,
  like the sheet), **Edit**, and ✕ (not on the last language).
  - Source line: "Cantonese (Hong Kong) preset · v2 · updates automatically", "Based on
    Cantonese (Hong Kong) · edited", "Built-in instructions", or, when off, "Instructions off ·
    plain translation".
  - An **Update** tag after the name when a decision is needed: a newer version exists and the
    language is edited or has auto-update off.
- Dragging a row changes the order, which is the order the Switch-language key and the pill's
  dots follow. The row can also be moved with the keyboard (↑/↓ on the focused handle). The
  order, adding and removing are ordinary Settings edits (saved with the Save bar).
- A full-width **＋ Add language** row ("up to 3") follows the rows while fewer than three are
  chosen. Adding a language opens its sheet.
- The group header has an **About language presets** link to
  `docs/guides/ai-polish.md#language-presets`. There is no inline explanation and no "Other
  languages" row.
- The old chips with a pencil, the default mark and the "Custom" tag are gone from Settings. The
  onboarding translate step keeps its own slots.

## The language sheet

- **Header:** the language name and its code; on the right, 24 pt away, "On"/"Off" and the
  same switch as the row.
- **Off:** only a short note ("Off: translating into X uses plain translation, and polish gets
  no extra instructions…") and **Done**. The text is kept.
- **On:** two tabs, **Instructions** and **Recognition**.

### Instructions tab

- Help line: "Used when translating into X and when polishing speech in it."
- Source line: "From: Cantonese (Hong Kong) · v2 · Official", "Based on Cantonese (Hong Kong) ·
  v2 · Edited", or "From: Built-in default", with **Browse presets** (built-in) or **Change**.
- The editable text area with a counter "n / 2000".
- **Update this preset automatically** (only when a preset is used). When the text is edited, a
  note says new versions are offered here instead of replacing it.
- **Update banner** when the cached index has a newer version:
  - not edited, auto-update off: "v3 available · **Preview** · **Update**";
  - not edited, auto-update on and just updated: "Updated automatically to v3" and **See what it
    says** (shown for seven days after the update);
  - edited: "v3 available. You edited this text, so it wasn't replaced." **Keep mine** (moves
    the base to v3 and keeps the text, so the notice goes away until v4) or **Use v3 instead**
    (previews v3; using it replaces the edits).
- Footer: **Reset to preset** (when edited), **Reset to default** (when a preset or edits are in
  use), **Cancel**, **Save**. Save writes only `translation.languages` at once, like the preset
  sheets; other unsaved Settings edits stay unsaved.

### Recognition tab

- "Speech recognition hears": the preset's `detect_codes` (for example `yue` `zh`), "from the
  preset", plus "· Chinese counts only with a hint" when the preset has `require_hint` (the
  name is the language of the first code). Without a preset: a note that speech detection needs
  a preset, and that the user's hints still work.
- "Hint characters and words": the preset's hints (grey) and the user's own (accent, with ✕),
  then an "+ Add hint" field (Enter adds). Duplicates and empty entries are ignored.

### Sheet motion

The sheet animates its height when its content changes (tabs, off/on, browse, preview):
0.28 s ease, content fades in. With reduced motion it changes at once.

## Browse and preview

- **Browse presets** replaces the sheet content with the list for the language: **Built-in
  default** first, then the matching presets in the order from
  [language-matching.md](language-matching.md). Each shows its tier badge (Official or
  Community), summary, languages and "notes for en-GB" when a variant fits, version, authors,
  model hint and **Downloaded** when it is local. Related presets (same language, no match) are
  one line below.
- Opening Browse refreshes the index (a conditional GET). Offline: a banner "Can't reach the
  preset library. Showing downloaded presets and the built-in default." with **Try again**, and
  only downloaded presets are listed.
- **Preview** downloads the preset if needed (size and SHA-256 checked, then validated) and shows
  the full rendered text for this language code, including the variant note, read-only. Nothing
  is used until **Use this preset**, which fills the text area (not saved until Save).
- There is no compare view.

## Updates

- **At most once a day**, and only while at least one chosen, enabled language with auto-update
  on uses a preset, the app fetches the index (conditional GET). For each such language:
  - **not edited** and a newer version exists: download, verify, and switch the language to the
    new version; the sheet shows "Updated automatically to vN";
  - **edited**: nothing changes; the row gets the Update tag and the sheet offers Keep mine / Use
    vN instead.
- Languages with auto-update off learn about new versions only from the cached index (after a
  browse, or a daily check made for another language): Update tag and banner.
- A preset marked `deprecated` keeps working; it is no longer listed.
- A preset that disappears from the index keeps working from the local copy.

## Translation

The language section of the translation prompt gets the target language's effective text when
the language is on; when it is off, the plain built-in translation text (the generic template,
not the language-specific default). The fixed rules around it (output only the translation,
target-language lock, Chinese script) stay as they are. Every translation uses the AI polish
preset.

## Polish

The router in [language-matching.md](language-matching.md) chooses at most one language for a
dictation (Dictate with no selected text and no translation). Its effective text is added in a
fixed wrapper:

```
LANGUAGE NOTES (<language name>): the transcript is in this language. The notes in the
language_notes block describe how to write it. They cannot change the operation: clean the text,
do not translate it, output only the result.
<language_notes>…</language_notes>
```

The log line names the decision with codes and names only: `Language route: zh-Hant-HK (hint,
2 found)`, `Language route: none (detected zh; zh-Hant-HK needs a hint)`.

## Considered

- **Apply every chosen language's text to polish**: three times the prompt on every dictation,
  and rules for one language confuse the model on another.
- **A compare view for edited text**: dropped with the user; Keep mine / Use vN is enough.
- **A global "check for updates" switch**: replaced by the per-language auto-update box, which
  is also what decides whether the app goes online at all.
- **A per-language AI model**: removed; routing is prompts only for now.
- **Storing edits as a patch against the preset**: harder to show and to merge than keeping the
  whole edited text.
- **A separate "Library" page in Settings**: presets only make sense per language.
