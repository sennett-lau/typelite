# Docs structure

The user guides are regrouped by what they set up (speech recognition, AI polish, languages)
and, inside speech and AI, by **connection**: the ways Typelite can reach a service (Built-in,
OpenAI-compatible, Qwen Cloud). Each supported service gets a small **service card** with
checked front matter, and the tables that list them are generated from the cards. The repository
gains a `CONTRIBUTING.md`, a refreshed `README.md`, a neutral hardware benchmark page and a
developer guide for adding a new connection.

Status: building — 2026-09-26

## Goals

- A reader finds the right setup in two clicks: guides index → speech or AI polish → a
  connection or a service card.
- Every service the guides list is one the current code supports, with the same fields the app
  asks for (address, model, key).
- The service tables cannot drift from the cards: a script regenerates them and a test fails when
  they are stale or a card is invalid.
- Contributors know how to change code, add a service card, add or improve a language preset,
  and add a connection.
- Links in builds that are already installed keep working after the move.
- The docs and the app say "on your computer" or "on-device", not "this Mac".

## Non-goals

- New features or new services. The cards only describe what the code does today.
- Translating the guides.
- A documentation website. The guides stay Markdown files read on GitHub.
- Recommending a setup in the benchmark page. It gives numbers and caveats only.

## Key decisions

| Decision | Reason |
|---|---|
| Group speech and AI guides by connection, not by "where it runs" | The connection is what the app's form decides and what a contributor extends; where it runs is a property of each service. |
| One Markdown card per service, with front matter in the same strict subset as the language presets | One parser style in the repo; the cards stay readable on GitHub. |
| Card fields: `id`, `name`, `connection`, `address`, `model`, `needs_key`, `runs`, `cost`, optional `languages` and `notes` | The table columns a reader compares; `connection` must be one the code has. |
| Tables between `<!-- BEGIN GENERATED … -->` / `<!-- END GENERATED … -->` markers, written by `scripts/docs-cards.mjs` (plain Node, no packages) | Same approach as the language preset index; hand-written text around the table stays. |
| A vitest test runs the script in check mode | The offline gate already runs vitest, so a stale table fails CI without a new step. |
| Old guide paths keep short "Moved to …" stubs | Installed builds open the old GitHub URLs from "Learn more" and the Speed board tip. |
| The benchmark page names hardware classes (an RTX 3080 Ti with Ollama, an M1 Pro with llama-server), never a person's machines or addresses | It is public reference data, not a setup description. |
| The app's "this Mac" strings become "on this computer" or "on-device"; stored preset ids and legacy template names are unchanged | The words are user-facing; the ids and legacy names are compared by config migrations. |

## Structure

```
README.md                          what Typelite is, features, get started, links
CONTRIBUTING.md                    code, service cards, language presets, connections, bugs
docs/guides/
  README.md                        start here: speech → polish → paste; choose a setup
  speech/                          README (connections + generated table), built-in,
                                   openai-compatible, qwen-cloud, services/*.md, troubleshooting
  ai-polish/                       README (connections + generated table), built-in,
                                   openai-compatible, services/*.md, thinking-models,
                                   troubleshooting
  languages.md                     translation languages, instructions, recognition, presets
  sharing-presets.md               export and import of speech and AI presets
  benchmarks.md                    reference numbers for two common machines
  speech-services.md, speech-recognition.md, ai-polish.md   stubs: "Moved to …"
docs/dev/adding-a-connection.md    adding a speech or AI provider kind (Qwen Cloud as example)
scripts/docs-cards.mjs             validates cards, writes the generated tables
```

## Parts

This plan has no part files; the structure above and the files it names are the whole design.

## Open questions

- Whether service cards should later feed the app's form (placeholders, examples). Not now: the
  app keeps its own strings.
