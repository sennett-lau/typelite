# Safety

Why a preset from strangers on the internet cannot harm the user, and the limits that keep it
so. Back to [index](index.md).

## What a preset is

- **Text only.** A preset is Markdown that the app parses into plain strings. There is no code,
  no template language, no variables, no links followed, no images loaded. The app never
  renders the Markdown as HTML; the preview shows plain text.
- **Bounded.** At most 8 KiB per file and 2000 characters of rendered text per language, the
  same limit as text the user types. Front matter fields have their own limits
  ([preset-format.md](preset-format.md)).
- **Reviewed.** Every preset arrives by pull request; the checklist in
  [contributing.md](contributing.md) covers content, not only format. Nothing reaches users
  that is not merged into `main`.
- **Verified.** The app accepts a downloaded file only if its size and SHA-256 match the index
  and it passes the same validation as CI.
- **Seen before use.** The full rendered text is shown before the first use and before every
  update the user takes by hand. A language changes by itself only when the user turned on its
  auto-update, never over edited text, and the sheet then says so.

## What a preset cannot change

The rendered text goes into the `<language_instructions>` slot (translation) or the
`<language_notes>` slot (polish), exactly like a user's own text, with the same sanitising (the
tags are neutralised). Hints are only counted in the transcript; they never reach the prompt.
Around it the prompt keeps, in code:

- the operation (clean, translate) and "output only the result, no notes or quotes"; for polish,
  "do not translate";
- the target-language lock and "no bilingual output" for translation;
- the `[CHINESE_SCRIPT]` rule for Chinese targets;
- the security rules that treat the transcript as data.

So the worst a bad preset can do is produce worse wording in that language, which the user sees
in the preview and can reset with one button.

## Privacy

- Fetching is a plain GET to GitHub, on demand or once a day for languages with auto-update on
  ([fetch-and-verify.md](fetch-and-verify.md)). No identifiers, no telemetry, no ratings or
  download counts.
- The logs record preset ids, versions and language codes, never the text of a preset or of a
  dictation.

## Licence

Contributions are CC0-1.0 ([preset-format.md](preset-format.md)). Reviewers reject text copied
from sources whose licence does not allow it (for example a paid style guide or a GPL project's
prompts); short example sentences should be the contributor's own.
