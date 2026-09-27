# Contributing to Typelite

Thanks for helping. You can contribute in several ways, and most of them need no Rust or
TypeScript:

| You want to… | Section |
|---|---|
| Fix a bug or build a feature | [Code](#code) |
| Document a speech or AI service that already works | [Adding a service](#adding-a-service) |
| Make Typelite write your language better | [Language presets](#language-presets) |
| Recommend models for your language | [Language guides](#language-guides) |
| Support a service that needs its own protocol | [New connections](#new-connections) |
| Know the formats the docs check enforces | [Docs formats](#docs-formats) |
| Report a problem | [Reporting bugs](#reporting-bugs) |
| Cut a release (maintainers) | [Maintainers](#maintainers) |

## Code

### Setup

Typelite is a [Tauri 2](https://v2.tauri.app/) app: a React and TypeScript frontend in `src/`
and a Rust backend in `src-tauri/`. macOS on Apple Silicon is the main target.

You need:

- **Rust.** Install [rustup](https://rustup.rs/). The repository's `rust-toolchain.toml` selects
  the stable toolchain with `rustfmt` and `clippy`, so `cargo` inside the repository uses it
  automatically.
- **Node.js** 20 or later, with npm.
- **Xcode Command Line Tools** (`xcode-select --install`). Full Xcode is not needed.
- **CMake** (`brew install cmake`), to build whisper.cpp (part of the Rust build) and
  llama.cpp's `llama-server` (for the Built-in AI).
- The [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for macOS.

Then, from the repository root:

```sh
npm ci                     # install the exact frontend dependencies from package-lock.json
npm run tauri dev          # run the app with live reload
npm run build:app          # build llama-server, then the release app bundle
```

`npm run build:app` writes `src-tauri/target/release/bundle/macos/Typelite.app`. Without
`llama-server` (`npm run build:llama-server`, see `scripts/build-llama-server.sh`) the app still
builds and runs; the Built-in AI then reports that the server is missing.

macOS asks for Microphone and Accessibility permission. A build signed ad hoc gets a new code
signature on every build, and macOS may then silently ignore the old Accessibility grant: remove
Typelite from System Settings → Privacy & Security → Accessibility and add it again.

### The offline gate

Every pull request must pass these, with no warnings:

```sh
cd src-tauri && cargo test --lib && cargo fmt --check && cd ..
npx vitest run
npx tsc --noEmit
npx eslint src/
npx prettier --check src
npm run docs:check                          # language guides and generated tables
node scripts/language-presets.mjs --check   # language presets and index.json
```

End-to-end tests against real servers are optional: `bash scripts/e2e.sh` (see
`src-tauri/tests/e2e_services.rs` for the environment variables).

### Plans first

Larger features start with a plan in `docs/plans/YYYY-MM-DD-short-slug/` (the date the plan was
created). A plan explains what is built and why; it is not a to-do list. Read
[docs/plans/README.md](docs/plans/README.md) for the rules, and read the relevant plan before you
change a feature. Refer to plans by their slug, for example "plan `quick-speech-setup`", in
code comments, tests and commit messages. A small fix needs no plan.

### Commits and pull requests

- Keep commits small and separate: one change each (a plan, a feature step, its tests, docs), with
  a message that says what changed and why.
- Branch from `main` (`feature/<slug>` or `fix/<what>`), rebase on `main` before you open the pull
  request, and run the offline gate.
- Describe in the pull request what changed, how you tested it, and which plan it follows.
- Keep the code plain and explain macOS-specific APIs when you use them.
- Hard rules: everything stays free and open source; no telemetry; no cloud service by default
  (a cloud service is only ever used with the user's own key, after they choose it); never log
  dictated text. Do not copy code from GPL projects: Typelite is MIT.

## Adding a service

The speech and AI guides list the services Typelite works with, one row each in the Services
table of [Speech recognition](docs/guides/speech/README.md#services) or
[AI polish](docs/guides/ai-polish/README.md#services).

Only add services that work with the current code through an existing connection (Built-in,
OpenAI-compatible, or for speech Qwen Cloud). Test it in the app first.

- Add one row in the [Services row](#services-row) format.
- If it needs setup beyond a key, add a [server section](#server-section) under **Running your
  own server** in the connection's page (`openai-compatible.md`) and link the row to it. A cloud
  service gets a line in that page's **Cloud services** table and links there.
- Run `npm run docs:check`.

## Language presets

Language presets tell Typelite's AI how to write one language. Each one is a Markdown file in
`presets/languages/<id>/preset.md`; the app downloads them from this repository. The format,
naming rules, how recognition hints work and how to validate a preset are in
[presets/languages/README.md](presets/languages/README.md).

- Presets are released under **CC0-1.0**, so they can be copied into people's settings and edited
  there. Only submit text you wrote yourself.
- Run `node scripts/language-presets.mjs` (regenerates `index.json`) and `npm run docs:cards`
  (regenerates the catalogue in `presets/languages/README.md`), and commit both.
- Raise `version` whenever you change the text, the languages or the recognition fields.

Reviewers check that:

- the validator passes and the generated files are up to date;
- the text only describes how to write the language and asks the AI to do nothing else;
- the examples are correct, natural, short and your own;
- a native or fluent speaker approved the text;
- there are no links, no personal data, and nothing hateful, political or promotional;
- the recognition hints are specific to the language.

A `NOTES.md` next to the preset with test sentences, the model you used and what came out makes
review much faster.

## Language guides

A language guide tells people who dictate in one language which models to use so that their
language comes out the way they write it: the speech recognition model, the AI polish model, the
[language preset](presets/languages/README.md), how to set them up, and what was measured. Guides
live next to the language settings, in
[docs/guides/languages/](docs/guides/languages/README.md#language-guides). Anyone can add one for
their language, or improve one, with a pull request.

- Write one when the general setup does not write your language well (the speech model rewrites
  it into a standard written form, translates the English words you mix in, or polish changes its
  wording) and you have found a setup that does. A language that works with the general setup
  needs no guide; its language preset is enough.
- Test it with your own voice, not only with synthetic speech.
- Run `npm run docs:cards` to validate it and regenerate the index in
  `docs/guides/languages/README.md`, and commit both. The tests fail when a guide is invalid or
  the index is out of date.
- A guide can name a language preset; if your language needs one too, send it in the same pull
  request ([Language presets](#language-presets)).

### The guide file

One Markdown file per guide: `docs/guides/languages/<id>.md`, where `<id>` is a lowercase slug
such as `cantonese` or `mandarin-taiwan`. It starts with front matter, then fixed sections.

The front matter is one `key: value` per line, in a strict format: plain text, no
lists, no `|`.

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

| Section | Required | What goes in it |
|---|---|---|
| `## Recommended setup` | yes | A table: speech recognition, AI polish and language preset, each with one line on why. |
| `## Why` | yes | What goes wrong with the general setup, with a real example: what was said, what the general setup wrote, what this setup writes. |
| `## Set it up` | yes | The steps, by hardware if they differ. Link to the setup guides instead of repeating them. |
| `## Results` | no | What you measured and how: the clips, the models and servers, the numbers. Say whether the speech was real or synthetic. |
| `## Known issues` | no | What still goes wrong, and anything the reader must do by hand. |

### Guide template

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

### Review checklist

- The setup works with the current Typelite, through its existing connections.
- The front matter passes the check, and the example in **Why** is real, not invented.
- Numbers say how they were measured; synthetic speech is labelled as such.
- No private addresses, machine names or keys.

## Docs formats

The guides follow two formats, so a new service, language or whole new part of Typelite looks
like what is already there. `npm run docs:check` enforces them, locally and on every pull request
that touches the docs (the **Docs** workflow). Claude Code users can let the skills in
`.claude/skills/` write the files: `add-service`, `add-language-guide`, `add-language-preset` and
`add-guide-step`.

### Guide steps

A step is one part of the pipeline with its own models and services: today speech recognition
and AI polish. A later one (for example read-aloud) copies the same shape:

```
docs/guides/<step>/
  README.md             what it does · ## Connections · ## Services · ## More
  built-in.md           if it has one: set it up · models · how it runs
  <connection>.md       one per connection: enter a service · protocol ·
                        ## Running your own server · ## Cloud services
  troubleshooting.md    Test fails · slow or wrong results · still stuck
docs/guides/models/<step>.md   kinds of model · by hardware · by language
```

A step folder holds only `.md` pages, no subfolders. Register a new step in `STEPS` in
`scripts/docs-cards.mjs` and add it to the table in `docs/guides/README.md`.

#### Services row

The Services table in the step's `README.md` starts with exactly this header, one row per service:

```markdown
| Service | Runs | Cost | API key | Address (example) | Model (example) | Notes |
|---|---|---|---|---|---|---|
| [Groq](openai-compatible.md#cloud-services) | Cloud | Free tier | Yes | `https://api.groq.com/openai/v1` | `whisper-large-v3-turbo` | Free daily allowance. |
```

| Column | Allowed |
|---|---|
| Service | A link to where it is set up: its server section, the Cloud services table, or its own page. |
| Runs | `On your computer`, `Your computer or network`, `Your network` or `Cloud`. |
| Cost | `Free`, `Free tier` or `Paid`. |
| API key | `Yes` or `No`; a cloud service always needs one. |
| Address (example) | As the app's **Address** field wants it, in backticks: `http://` or `https://`, no trailing `/`, stopping before the path Typelite adds (`/audio/transcriptions`, `/chat/completions`). `<computer-address>` for another computer; `—` for Built-in. |
| Model (example) | As the app's **Model** field wants it. |
| Notes | One short line; may be empty. |

Rows go Built-in first, then servers you run, then cloud services.

#### Server section

A `###` section under **Running your own server**, in this order:

1. One sentence: what it is, with a link to the project.
2. How to install and start it, as a command block.
3. "Use address `…` and model `…`."
4. Notes that matter: memory, serving other computers, firewall, turning thinking off.

### Language guides

The format is in [The guide file](#the-guide-file) and the [Guide template](#guide-template)
above. The check validates the front matter and the required sections, and rewrites the index on
the Languages page with `npm run docs:cards`.

### Links

Every relative link in `README.md`, `CONTRIBUTING.md`, `docs/guides`, `docs/dev`,
`presets/languages` and `.claude/skills`, and its `#anchor`, must point at a file and heading that
exist.

## New connections

A connection is a way Typelite talks to a service: its own Rust provider, a config kind, and the
form logic that picks it. Adding one is a code change with a plan. See
[docs/dev/adding-a-connection.md](docs/dev/adding-a-connection.md), which walks through the
Qwen Cloud speech connection as an example.

## Reporting bugs

Open an issue on GitHub with:

- what you did, what you expected and what happened;
- your macOS version, your chip (for example Apple M1 Pro) and the Typelite version
  (the About page);
- which speech and AI connection you use (Built-in, or the kind of server; not your key or private
  addresses);
- the log file `~/Library/Logs/Typelite/typelite.log`. It holds timings, sizes and errors, never
  the text you dictated. Look it over before you attach it.

## Maintainers

Releases are built by GitHub Actions when a `vX.Y.Z` tag is pushed, and land as a draft to review
and publish. The steps, checksums and the unsigned-app caveat are in [Releasing](docs/releasing.md).
The [CI workflow](.github/workflows/ci.yml) runs the offline gate on pull requests.

## Code of conduct

Be kind and assume good intent. Critique ideas, not people. Maintainers may remove comments or
contributions that are hostile, harassing or off topic.
