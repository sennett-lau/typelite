# Preset format

The schema of `preset.md`: front matter, body sections, how the text the model sees is built,
and the limits. Back to [index](index.md).

## Example

```markdown
---
id: english
name: English
version: 1
format: 1
tier: official
languages: [en]
applies_to: [polish, translate]
summary: Clear, natural English that keeps the speaker's tone, with spelling per region.
authors: [sennett-lau]
license: CC0-1.0
model_hint: Works with small 4B instruct models.
detect_codes: [en]
---

## Instructions

Write clear, natural English, the way a fluent speaker writes a message...

## Variant: en-GB

British spelling and vocabulary: colour, organise, travelled, flat, mobile...

## Variant: en-US

American spelling and vocabulary: color, organize, traveled, apartment, cell phone...

## Examples

"..." → ...
```

## Front matter

A strict subset of YAML: one `key: value` per line, values are a plain or double-quoted string,
an integer, or an inline list `[a, b]`. No nesting, no multi-line values, no comments. Both the
Node generator and the app parse this subset only, so there is no YAML library to trust.

| Key | Required | Rule |
|---|---|---|
| `id` | yes | Slug `^[a-z0-9]+(-[a-z0-9]+)*$`, 3–48 characters, equal to the folder name. |
| `name` | yes | Display name, at most 60 characters. English, optionally with the native name: `Cantonese (Hong Kong) 廣東話`. |
| `version` | yes | Positive integer. Every change to the body, `languages` or the recognition fields raises it by one. |
| `format` | yes | Format version of this file, `1` today. The app skips presets with a format it does not know. |
| `tier` | yes | `official` (maintained by the project) or `community`. Only maintainers set `official`. |
| `languages` | yes | Non-empty list of BCP 47 tags `language[-Script][-REGION]`: language 2–3 lower-case letters listed in `language-codes.json`, script 4 letters title case, region 2 upper-case letters or 3 digits. No tag may be a prefix of another in the same list (`[en, en-GB]` is redundant). Matching is in [language-matching.md](language-matching.md). |
| `applies_to` | yes | Non-empty list of `polish`, `translate`. |
| `summary` | yes | One sentence, at most 140 characters, shown in the list. |
| `authors` | yes | GitHub user names, at least one. |
| `license` | yes | Must be `CC0-1.0`. |
| `model_hint` | no | At most 140 characters, shown next to the preset: "4B models slip into written Chinese; 7B or larger follows it better." A hint, never enforced. |
| `deprecated` | no | A short reason. The app no longer lists the preset but keeps it working for users who have it. |
| `detect_codes` | no | Speech-recognition language codes that mean "this language" for the polish router: 2–3 lower-case letters as Whisper reports them (`en`, `zh`, `yue`), at most 8, no duplicates. Missing or empty: speech detection never picks this preset's language; only hints can. |
| `hints` | no | Characters or words that mark a transcript as this language (Cantonese `嘅 咗 喺`), at most 60, each 1–24 characters, no duplicates, no `,` `[` `]` `"`. |
| `require_hint` | no | `true` or `false` (default). `true`: a detected code alone is not enough; a hint must match. Needs `hints`. For languages whose speech code is shared with another written form (Whisper reports `zh` for Mandarin and for Cantonese). |

Unknown keys are an error, so a typo (`language:`) does not silently drop a field.

### Recognition fields

`detect_codes`, `hints` and `require_hint` (added while building, see [index](index.md)) tell the
polish router in [language-matching.md](language-matching.md) when a transcript is in the
preset's language. They are data, so the app has no rules for any particular language. The
seed presets use:

| Preset | `detect_codes` | `hints` | `require_hint` |
|---|---|---|---|
| `cantonese-hong-kong` | `[yue, zh]` | Cantonese-only characters and words: 嘅 咗 喺 啲 冇 唔 佢 嚟 哋 嘢 咁 係咪 聽日 琴日 點解 邊度 而家 得閒 … | `true`: Whisper says `zh` for Mandarin too, so plain Mandarin must not get Cantonese rules. |
| `english` | `[en]` | none | `false` |
| `mandarin-taiwan` | `[zh]` | Taiwan-only wording: 軟體 網路 筆電 計程車 公車 簡訊 程式 捷運 超商 腳踏車 | `true`: a `zh` transcript may be mainland Mandarin or Cantonese; without a Taiwan word or a user hint the notes are not added. |

`require_hint: true` for Taiwan Mandarin is a judgement call: Taiwan-specific words are rarer in
short dictations than Cantonese particles, so the preset is used less often, but it is never
applied to Simplified or Cantonese speech. Users who dictate only Taiwan Mandarin add their own
hints, or a contributor can change it.

## Body

After the front matter the body holds only these level-2 sections, in this order:

| Section | Required | Content |
|---|---|---|
| `## Instructions` | yes | How to write this language: words, grammar, script, punctuation, register, what to keep in English. Phrased as a writing guide ("Write colloquial written Cantonese…"), not as "Translate into…", so the same text serves polish and translation. |
| `## Variant: <tag>` | no, repeatable | A short note for one variant, for example `en-GB`. The tag must be matched by the preset's `languages` and appear once. At most 400 characters each. |
| `## Examples` | no | A few example lines, usually `"source" → result`. Kept short: examples are the most effective part of a prompt for small models, and the most expensive. |

Any other heading, or text before `## Instructions`, is an error. Level-3 headings and lists are
fine inside a section.

## The text the model gets

The app renders the preset for one selected language code:

```
<Instructions>

Notes for <tag>:
<Variant text for the most specific variant that matches the selected code, if any>

Examples:
<Examples, if any>
```

- The variant used is the longest `## Variant` tag that matches the selected code the same way
  `languages` does (see [language-matching.md](language-matching.md)); `en-GB` gets the `en-GB`
  note, `en` gets none.
- The rendered text of every variant, and of the no-variant case, must be at most **2000
  characters** (Unicode scalar values, as the app counts them). That is the existing limit of a
  language's instructions (`TRANSLATION_INSTRUCTIONS_MAX_CHARS`), so the rendered preset always
  fits the text area and the user can edit it without cutting.
- The whole file is at most 8 KiB.
- The rendered text goes into the same `<language_instructions>` slot as a user's own text,
  with the same sanitising. The fixed rules around it stay in code (see [safety.md](safety.md)).

## Licence of contributed text

Every preset is `CC0-1.0`, stated in its front matter and in the contributor guide; opening the
pull request is the agreement. Reasons:

- The rendered text is copied into the user's settings, edited, and shared again. A licence that
  needs a notice (MIT, CC-BY) would have to follow every copy, which nobody can do for a
  settings field.
- An official preset may become a built-in default inside MIT code; CC0 makes that trivially
  compatible.
- Credit still happens: `authors` is shown in the app and kept in the file.

## Considered

- **Semver `version`**: minor/major has no meaning for prompt text, and comparing integers needs
  no parser.
- **`applies_to: both`**: a list extends to new operations without new combined values.
- **A single body with no sections**: regional notes would need a copy per region, and the app
  could not show examples separately in the preview.
- **Full YAML front matter**: needs a YAML library in the app and allows anchors, tags and
  nesting that nobody needs.
- **MIT or CC-BY-4.0 for contributions**: both need attribution to travel with the text.
- **Separate text per operation** (`## Polish`, `## Translate`): doubles the review and the size
  for little gain; a writing guide works for both, and the fixed prompt around it says which
  operation it is.
