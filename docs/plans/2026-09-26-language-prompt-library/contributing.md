# Contributing presets

How people add or change presets, how they are named, and what reviewers check. The
contributor-facing version is `presets/languages/README.md`. Back to [index](index.md).

## Flow

1. Check `index.json` (or the folder list) for a preset that already covers the language. If
   one does, improve it or add a `## Variant: <tag>` note to it rather than starting another.
2. Create `presets/languages/<id>/preset.md` from the template in the README. Set `tier:
   community`, `version: 1`, `license: CC0-1.0` and your GitHub name in `authors`.
3. A language whose primary subtag is not in `language-codes.json` needs a line there in the same
   pull request (code and English name, from the IANA subtag registry).
4. Run `node scripts/language-presets.mjs`: it validates every preset and rewrites `index.json`.
   Commit both.
5. Optional but welcome: `NOTES.md` with test sentences, the model you tried and what came out.
6. Open a pull request. Changes to an existing preset raise its `version` by one.

## Naming

- The id is the language in English, lowercase, then what narrows it: region, then style:
  `cantonese-hong-kong`, `mandarin-taiwan`, `english`, `english-plain-legal`,
  `spanish-mexico`.
- Only `[a-z0-9-]`, 3–48 characters, no language codes (`zh-hant-hk`) and no personal names.
- An id is permanent. A replacement gets a new id and the old one gets `deprecated: "Replaced
  by <new id>"`. Removed ids are never reused.

## New languages and variants

- **A new region of a covered language** (en-NZ): usually a `## Variant: en-NZ` section in the
  shared preset, a few lines.
- **A different style for a region** (formal written Chinese for Hong Kong rather than written
  Cantonese): a new preset with the same `languages`; both are listed, official first.
- **A new language**: a new preset, plus the code in `language-codes.json` if missing.
- Opening an issue first is welcome for a new language, not required.

## Review checklist

- The validator passes and `index.json` is regenerated.
- The text describes how to write the language; it does not try to change the operation
  ("answer the question", "add a note"), the output format or the target language, and has no
  instructions about anything but writing.
- Examples are correct, natural, short, and the contributor's own.
- A native or fluent speaker has approved the text (a reviewer, or a linked comment).
- Nothing hateful, political or promotional; no links, no personal data. Naming slang or swear words so the model keeps them as spoken is fine (dictation must not censor the speaker).
- `tier: official` only in pull requests by maintainers.
- The `version` went up if the body, `languages` or the recognition fields changed.
- Hints are words or characters only this language uses (not ones shared with a neighbour), and
  `require_hint` is set when the speech code is shared (`zh`).

## Validation

`node scripts/language-presets.mjs --check` and the Rust test `llm::language_library` both fail
on:

- a missing, unknown or badly typed front matter key, or a value over its limit (including
  `detect_codes`, `hints` and `require_hint`, which needs hints);
- an `id` that is not a valid slug, differs from its folder, or appears twice;
- a language tag that is not well formed, whose primary subtag is not in
  `language-codes.json`, or that is a prefix of another tag in the same list;
- a missing `## Instructions`, an unknown heading, text before `## Instructions`, a
  `## Variant` tag not matched by `languages` or given twice;
- rendered text over 2000 characters for any variant, or a file over 8 KiB;
- CR line endings, a byte-order mark or a file that is not UTF-8;
- a file other than `preset.md` and `NOTES.md` in a preset folder;
- an `index.json` that differs from what the generator would write.

## Considered

- **A web form or issue template that creates the preset**: nice later, but a pull request with
  one Markdown file is already the simplest path and keeps review in one place.
- **Letting anyone set `official`**: the badge would mean nothing.
