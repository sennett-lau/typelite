# Contributing to Typelite

Thanks for helping. You can contribute in several ways, and most of them need no Rust or
TypeScript:

| You want to… | Section |
|---|---|
| Fix a bug or build a feature | [Code](#code) |
| Document a speech or AI service that already works | [Service cards](#service-cards) |
| Make Typelite write your language better | [Language presets](#language-presets) |
| Recommend models for your language | [Language guides](#language-guides) |
| Support a service that needs its own protocol | [New connections](#new-connections) |
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
npm run docs:check                          # service cards and generated tables
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

## Service cards

The speech and AI guides list the services Typelite works with. Each service is one small
Markdown file, a **service card**:

- speech: `docs/guides/speech/services/<id>.md`
- AI polish: `docs/guides/ai-polish/services/<id>.md`

Only add services that work with the current code through an existing connection
(`builtin`, `openai-compatible`, or for speech `qwen-cloud`). Test it in the app first.

### Template

```markdown
---
id: example-service
name: Example Service
connection: openai-compatible
address: https://api.example.com/v1
model: example-model-1
needs_key: true
runs: cloud
cost: free-tier
languages: About 50 languages
notes: Free daily allowance; audio is sent to Example.
---

Short setup: where to get a key, what to install, anything unusual.
```

### Front matter

One `key: value` per line; values are text (quotes optional), `true` or `false`. No other YAML
features.

| Key | Required | Allowed values |
|---|---|---|
| `id` | yes | Same as the file name without `.md`; `a-z`, `0-9` and `-`. |
| `name` | yes | Name shown in the table, at most 40 characters. |
| `connection` | yes | Speech: `builtin`, `openai-compatible` or `qwen-cloud`. AI: `builtin` or `openai-compatible`. |
| `address` | yes | An example address as the app's **Address** field wants it (`http://` or `https://`, no trailing `/audio/transcriptions` or `/chat/completions`), or `none` for built-in. Use `<computer-address>` for a server on another computer. |
| `model` | yes | An example model name as the app's **Model** field wants it. |
| `needs_key` | yes | `true` or `false`. |
| `runs` | yes | `on-device`, `local-network` or `cloud`. |
| `cost` | yes | `free`, `free-tier` or `paid`. |
| `languages` | no | A short note, at most 60 characters. |
| `notes` | no | One line shown in the table, at most 120 characters. |

### Check and regenerate

```sh
npm run docs:cards     # validate every card and rewrite the generated tables
npm run docs:check     # validate only; fails if a table is out of date
```

Commit the card together with the regenerated `README.md` of its folder. The tests fail when a
card is invalid or a table is stale.

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

The front matter is one `key: value` per line, in the same strict format as the
[service cards](#service-cards): plain text, no lists, no `|`.

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
| `## Set it up` | yes | The steps, by hardware if they differ. Link to the service cards and setup guides instead of repeating them. |
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
