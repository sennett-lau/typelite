---
name: add-language-preset
description: Add or update a language preset (presets/languages/<id>/preset.md), the instructions that tell Typelite's AI how to write one language. Use when someone wants to improve how Typelite writes their language, or a language guide needs a preset.
---

# Add a language preset

The format, naming rules and recognition hints are in
[presets/languages/README.md](../../../presets/languages/README.md); the rules for contributors
are in [CONTRIBUTING.md → Language presets](../../../CONTRIBUTING.md#language-presets). Read both
first, and one existing preset as an example.

1. **Ask:** the language and region, its tags, what the AI should do differently (wording,
   script, which words stay in English), a few short example sentences of the user's own, whether a
   native or fluent speaker approved the text, and the authors.
2. **Write** `presets/languages/<id>/preset.md`. The text only describes how to write the
   language; it never asks the AI to do anything else. No links, no personal data. Presets are
   CC0-1.0, so only text the user wrote. When updating, raise `version`.
3. **Recognition hints** must be specific to the language (words other languages do not use).
4. Optionally a `NOTES.md` next to it: test sentences, the model, what came out.
5. **Check:** `node scripts/language-presets.mjs` (regenerates `index.json`), `npm run docs:cards`
   (regenerates the catalogue), then `node scripts/language-presets.mjs --check` and
   `npm run docs:check`. Show the diff; do not commit unless asked.
