# Repository layout

Where the preset files live in the repository and what else sits next to them. Back to
[index](index.md).

## Tree

```
presets/
  languages/
    README.md                 ← contributor guide (format, naming, checklist)
    index.json                ← generated; the only file the app lists from
    language-codes.json       ← known primary language subtags → English name
    .gitattributes            ← LF line endings, so hashes match on every checkout
    cantonese-hong-kong/
      preset.md               ← the preset (front matter + text)
    english/
      preset.md
    mandarin-taiwan/
      preset.md
    <id>/
      preset.md
      NOTES.md                ← optional, for reviewers and humans; never downloaded
scripts/
  language-presets.mjs        ← builds index.json; `--check` validates and fails if stale
src-tauri/src/llm/
  language_library.rs         ← test-only for now: independent parser, validation, matching
```

## Rules

- **Folder name = preset `id`.** Lowercase kebab-case slug, unique, never renamed and never
  reused (see [contributing.md](contributing.md)). The app stores the id, so a rename would
  orphan every download.
- **Keyed by slug, not by language.** There is no `presets/languages/en/` folder. A language code
  appears only in front matter, so one preset can serve many codes and one code many presets.
- **`preset.md` is the only file the app downloads.** Examples and regional notes live inside
  it (sections, see [preset-format.md](preset-format.md)). No images, no scripts, no other
  assets.
- **`NOTES.md` is optional** and explains the preset to reviewers (sources, why a word choice,
  test sentences and results with a given model). It is not in the index. Any other file in a
  preset folder fails validation.
- **`language-codes.json`** lists the primary language subtags the validator accepts (`en`,
  `zh`, `yue`, `ja`…), with English names, plus the macrolanguage map used for matching
  (`yue` → `zh`, `cmn` → `zh`). Adding a language starts with a line here, so a typo like
  `zn-Hant-HK` fails early and a new language is a visible decision in review. Regions and
  scripts are only checked for form, not against a list.
- **`index.json` is generated and checked in.** `node scripts/language-presets.mjs` writes it;
  `node scripts/language-presets.mjs --check` exits non-zero when a preset is invalid or the
  index is stale. The Rust test does the same checks with its own parser. The file has no
  timestamp, so regenerating without changes gives no diff.
- **`.gitattributes`** forces LF for everything under `presets/languages/`, so the SHA-256 in
  the index is the SHA-256 of the file GitHub serves, on every platform.

## Why at the repository root

`presets/` is data, not app source: it is not compiled into the app, it changes on a different
rhythm (merged pull requests, not releases), and contributors should find it without knowing
the code. The `languages/` level leaves room for other kinds of shareable text later (for
example dictionary word lists) without mixing them.

## Considered

- **One folder per language** (`presets/languages/en/…`, `zh-Hant-HK/…`): the shared English
  preset would need copies or symlinks per region, and a preset for "Cantonese in HK and Macau"
  has no single home.
- **A single YAML/JSON file with every preset**: every contribution edits the same file
  (merge conflicts), and long prompt text in JSON strings is hard to review.
- **Separate `examples.md` next to `preset.md`**: two downloads and two hashes for one prompt,
  and the reviewer has to read both to see what the model gets.
- **A separate repository**: its own issues and permissions, but splits the contribution guide
  and the test from the code that uses the format. Easy to move later, since the app only needs
  a base address.
- **Under `docs/`**: presets are user-facing data, not documentation about Typelite.
