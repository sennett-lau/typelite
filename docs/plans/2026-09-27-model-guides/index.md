# Model guides

Model advice moves from one page (`docs/guides/models.md`) into a folder with two kinds of guide.
**Task guides** cover one job each, speech recognition and AI polish: the kinds of model, what
to pick for your hardware, and settings such as turning off thinking. **Language guides** cover
one language each, for people who want it written a particular way: which speech model keeps
it, which polish model and language preset go with it, how to set it up, and measured results.
A reader who does not care about language follows the task guides; a reader who does starts with
their language. Language guides share a checked format, like the service cards, so the community
can add more.

Status: building — 2026-09-27

Changes one decision of plan [docs-structure](../2026-09-26-docs-structure/index.md): "Model
suggestions live in one page, `models.md`". Everything else there stands.

## Goals

- Two clear paths: "language does not matter, choose by hardware" and "choose for my language".
- The speech model is treated as the first choice for a language: polish cannot bring back words
  speech recognition changed.
- A contributor can add a guide for their language by copying a template; a check rejects a guide
  with missing fields or sections, and the index of guides is generated.
- The first language guide, Cantonese, gives a setup that works with the current code and the
  numbers behind it.

## Non-goals

- Guides for languages nobody has tested. The folder starts with Cantonese only; English and
  others follow the task guides until someone writes and tests a guide.
- Recommending one hardware setup. Task guides give options by hardware, as before.
- Changing the service cards or the language presets' format.

## Key decisions

| Decision | Reason |
|---|---|
| `docs/guides/models/` with `README.md` (start here), `speech-recognition.md` and `ai-polish.md`; the language guides live in `docs/guides/languages/` (see the last decision) | The two tasks and the languages are the two ways people look for a model. |
| A language guide is `docs/guides/languages/<id>.md` with front matter (`id`, `language`, `codes`, `speech`, `polish`, `tier`, `authors`, optional `preset`, `tested`, `notes`) and the sections Recommended setup, Why, Set it up (Results and Known issues optional) | The same strict front matter as service cards and presets; fixed sections make guides comparable. |
| `scripts/docs-cards.mjs` validates the guides and writes their index in `docs/guides/languages/README.md`; the existing vitest check covers it | One generator and one check for all docs tables; a stale index fails CI. |
| `preset` must name a folder in `presets/languages/` | A guide cannot point at a preset that does not exist. |
| `tier: official` for guides the maintainers tested, `community` for others | Same meaning as for presets. |
| The format, a template and the review checklist are in `CONTRIBUTING.md` (Language guides), next to the service card format | Contribution rules live in one place; the guides folder holds only pages for readers. |
| `models.md` becomes a "Moved to …" stub listing where each old section went | Links from older releases and elsewhere keep working. |
| 2026-09-27, owner's decision: `languages.md` becomes the folder `docs/guides/languages/`, with `README.md` (the language settings page, which opens with the index of language guides) and one file per guide, such as `cantonese.md`. `languages.md` stays as a "Moved to …" stub | One place for everything about a language: its settings and the community's guides for it. Replaces the earlier decision that `languages.md` stays a single page and the guides live under `models/languages/`. |

## Parts

This plan has no part files; the structure is in `docs/guides/models/README.md` and
`docs/guides/languages/README.md`, and the guide format in `CONTRIBUTING.md` (Language guides).

## Open questions

- Whether language guides should later appear in the app (for example next to a language in
  Settings).
