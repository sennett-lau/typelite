# Language evaluations

A dataset and runner for measuring how well Typelite **polishes** dictations and **recognises
speech**, in every language, through the app's own code. It needs only text and audio, so an
agent can run it, read the failures and improve the dataset or the polish prompt on its own.
The design is plan [`language-evals`](../docs/plans/2026-10-09-language-evals/index.md); the
loop for agents is in [AGENTS.md](AGENTS.md).

## Commands

```sh
npm run eval -- check                                   # validate the dataset (offline)
npm run eval -- polish --llama-model <file.gguf>        # built-in AI (llama-server)
npm run eval -- polish --ai-url http://127.0.0.1:8080/v1 --ai-model <name>   # any OpenAI-compatible server
npm run eval -- speech --whisper-model <ggml-file.bin>  # built-in speech (whisper.cpp)
npm run eval -- speech --speech-url http://127.0.0.1:8178/v1 --speech-model <name>
npm run eval -- synth                                   # make the synthetic clips (macOS `say`)
```

Options for `polish` and `speech`:

| Option | Meaning |
|---|---|
| `--lang yue,en` | Only these languages (folder names). |
| `--split dev\|holdout\|all` | Which cases; default `dev`. |
| `--tag numbers` / `--id en-011` | Only cases with this tag / these ids. |
| `--n 3` | Samples per polish case (temperature noise); default 3. |
| `--languages en,zh-Hant-HK` | The user's language list for polish routing (default: the app's default list). |
| `--baseline <file>\|none` | Compare with this baseline; default `evals/baselines/<kind>-<model>.json` if it exists. |
| `--save-baseline` | Write the results into that baseline file (only when intended, see AGENTS.md). |
| `--out <dir>` | Where results go; default `output/evals/<time>-<kind>/` (git-ignored). |

The built-in AI needs `src-tauri/binaries/llama-server-<triple>` (`bash scripts/build-llama-server.sh`)
and a GGUF file; the recommended one is `Qwen3-4B-Instruct-2507-Q4_K_M.gguf`, which the app
downloads into its `models` folder. The built-in speech test needs a ggml Whisper model, such as
`ggml-large-v3-turbo-q5_0.bin` from the same folder.

Each run writes `summary.md` (per language, per tag, failed checks, every failing case with its
answer) and `results.json` (every sample). Nothing is sent anywhere except the server you name.

### How it reuses the app

`scripts/evals/cli.mjs` starts `src-tauri/examples/eval_run.rs`, which calls the same code as a
dictation: language routing, the polish prompt, `LlmProvider::polish` with its clean-up of the
answer, and the dictation language guard; for speech, the recognition provider with the voice
check and hallucination filters. Scoring is plain Node in `scripts/evals/score.mjs`.

## Layout

```
evals/
  languages.json            one entry per language: unit (word|char), fillers, dialect
  polish/<lang>/dev.jsonl   cases used for tuning
  polish/<lang>/holdout.jsonl  cases never used for tuning
  speech/<lang>/manifest.jsonl
  speech/<lang>/audio/      recordings (16 kHz mono 16-bit WAV); audio/synthetic/ is generated
  baselines/<kind>-<model>.json
```

## Polish cases

One JSON object per line:

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Unique across the dataset, lowercase-kebab, language prefix (`yue-014`, `en-h03` for holdout). |
| `input` | yes | A realistic Whisper-style transcript: no punctuation, fillers, run-ons, spoken numbers. |
| `expected` | yes | The ideal polished text. |
| `accept` | no | Other answers that are equally right. |
| `must_contain` / `must_not_contain` | no | Words that must survive / must be gone (ASCII words match whole words, case-insensitive). |
| `tags` | yes | From: `filler`, `self-correction`, `numbers`, `punctuation`, `newline`, `list`, `dash`, `keep-meaning`, `script`, `dialect`, `mixed-language`. |
| `split` | yes | `dev` or `holdout`; must match the file. |
| `max_error` | no | Allowed error rate for this case (default 0.3 words, 0.25 characters). |
| `notes` | no | Why the case exists, and credit for its source. |

A sample **passes** when, for at least one of `expected` and `accept`, all checks pass:

- **error**: word error rate (characters for Chinese and Japanese) after removing punctuation and
  case, at most `max_error`;
- **must_contain / must_not_contain**;
- **filler**: none of the language's fillers (`languages.json`) unless the reference has it;
- **dash**: no em or en dash unless the reference has one;
- **numbers**: the same digit numbers as the reference (list numbering ignored);
- **list** and **layout**: the same number of list lines, lines and paragraphs as the reference;
- **punctuation** (cases tagged `punctuation` only): the same number of sentence breaks;
- **script** (Chinese): no characters of the other script (Simplified vs Traditional);
- **dialect** (Chinese): no Mandarin-only words in Cantonese, no Cantonese words in Mandarin,
  unless the reference has them.

`npm run eval -- check` also runs every case's `expected` and `accept` through these checks, so
a case cannot demand something its own answer fails.

## Speech clips

`manifest.jsonl`, one clip per line: `id`, `audio` (path under `audio/`), `text` (the exact
words), optional `accept`, `tags` (`clean`, `numbers`, `names`, `dialect`, `mixed-language`,
`noisy`, `accent`), `source` (`recording`, `synthetic-say` or `external`), `licence`, `speaker`,
`split`, and for synthetic clips `say_voice` (and `say_text` when the spoken text differs).

The score is the error rate after converting the answer into the reference's script (Whisper
often writes Cantonese in the wrong script; that is reported as a separate `script` check, and
the raw error is kept as `raw_error`). A clip passes at 15% error or less with no Mandarin words in
a Cantonese answer.

Synthetic clips are made with macOS `say` and are not committed; they are a smoke test, far
cleaner than real speech. **Real recordings are preferred**: short (under 15 s), 16 kHz mono
16-bit WAV, committed under `audio/`. A large external set belongs in a fetch script, not in git.

## Adding a language

1. Add an entry to `languages.json` (`unit: "char"` for languages written without spaces; list
   the fillers that are always fillers, never words with meaning).
2. Create `polish/<lang>/dev.jsonl` and `holdout.jsonl` (about 10 cases to start; 25 to 40 dev and
   10 holdout for a main language), covering every tag that applies.
3. Optionally add `speech/<lang>/manifest.jsonl`.
4. Run `npm run eval -- check`, then a polish run.

## Contributing data

- Text and audio are licensed **CC0-1.0** or **CC-BY-4.0** (name the licence on each clip).
- Recordings only with the speaker's consent; say who spoke in `speaker` (a name or "volunteer").
- No private data: no real names of private people, addresses, numbers, company secrets or
  anything dictated in real work. Write invented sentences that sound like real dictation.
- **Holdout cases are never used for tuning.** Do not change a holdout case to make a score pass;
  fix a holdout case only when it is wrong, and say so in the PR.
