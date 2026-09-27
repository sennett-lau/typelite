# Language guides: format

A language guide tells people who dictate in one language which models to use so that their
language comes out the way they write it: the speech recognition model, the AI polish model, the
[language preset](../../../../presets/languages/README.md), how to set them up, and what was
measured. The list of guides is in [Choosing models](../README.md#language-guides).

Anyone can add a guide for their language, or improve one, with a pull request.

## When a language needs a guide

When the general setup in the [task guides](../README.md#task-guides) does not write it well: the
speech model rewrites it (for example into a standard written form), translates the English words
you mix in, or the polish model changes its wording. A language that works with the general setup
needs no guide; its [language preset](../../../../presets/languages/README.md) is enough.

## The file

One Markdown file per guide: `docs/guides/models/languages/<id>.md`, where `<id>` is a lowercase
slug such as `cantonese` or `mandarin-taiwan`. It starts with front matter, then fixed sections.

### Front matter

One `key: value` per line, in the same strict format as the
[service cards](../../../../CONTRIBUTING.md#service-cards): plain text, no lists, no `|`.

| Key | Required | What it holds |
|---|---|---|
| `id` | yes | The file name without `.md`. |
| `language` | yes | The language as readers know it, at most 40 characters: `Cantonese (Hong Kong)`. |
| `codes` | yes | The language tags it covers, comma-separated, as in Typelite's language list: `zh-Hant-HK, yue`. |
| `speech` | yes | The suggested speech recognition model, at most 60 characters. |
| `polish` | yes | The suggested AI polish model or kind of model, at most 60 characters. |
| `tier` | yes | `official` (tested by the maintainers) or `community`. |
| `authors` | yes | GitHub usernames, comma-separated. |
| `preset` | no | The id of the language preset to use; it must be a folder in `presets/languages/`. |
| `tested` | no | The date of the last test, `YYYY-MM-DD`. |
| `notes` | no | One short line, at most 120 characters. |

### Sections

| Section | Required | What goes in it |
|---|---|---|
| `## Recommended setup` | yes | A table: speech recognition, AI polish and language preset, each with one line on why. |
| `## Why` | yes | What goes wrong with the general setup, with a real example: what was said, what the general setup wrote, what this setup writes. |
| `## Set it up` | yes | The steps, by hardware if they differ. Link to the service cards and setup guides instead of repeating them. |
| `## Results` | no | What you measured and how: the clips, the models and servers, the numbers. Say whether the speech was real or synthetic. |
| `## Known issues` | no | What still goes wrong, and anything the reader must do by hand. |

The index table in [Choosing models](../README.md#language-guides) is generated from the front
matter. After adding or changing a guide, run `node scripts/docs-cards.mjs`; the tests fail when a
guide is invalid or the table is out of date.

## Template

```markdown
---
id: example-language
language: Example (Region)
codes: xx-Region
speech: The speech model
polish: The polish model, or "By hardware"
tier: community
authors: your-github-name
preset: example-language-preset
tested: 2026-01-31
---

# Example (Region)

One paragraph: who this is for, and the setup in one sentence.

## Recommended setup

| Step | Model | Why |
|---|---|---|
| Speech recognition | … | … |
| AI polish | … | … |
| Language preset | … | … |

## Why

What the general setup gets wrong, with an example.

## Set it up

1. …

## Results

What you measured, and how.

## Known issues

- …
```

## Review checklist

- The setup works with the current Typelite, through its existing connections.
- The front matter passes the check, and the example in **Why** is real, not invented.
- Numbers say how they were measured; synthetic speech is labelled as such.
- No private addresses, machine names or keys.
