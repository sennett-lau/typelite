# Runner

The one command and the code path it exercises. Back to [index](index.md).

```
npm run eval -- polish|speech [options]
   └─ scripts/evals/cli.mjs ── validates, filters, writes input JSONL
        └─ cargo run --release --example eval_run ── the app's code, one request at a time
        ← answers JSONL ── scored, summarised, compared, written to output/evals/<run>/
```

## Polish path

`eval_run polish` builds the request a plain dictation builds with default settings (General
app, "clean" style, Chinese script "preserve"), routes the transcript with
`language_router::route` over the user's language list (`--languages`, default the app's),
calls `LlmProvider::polish` (prompt builder, plain spaces, final-period rule) and applies
`output_guard` as the pipeline does. The detected speech language is not available from text, so
routing uses hints only.

## Speech path

`eval_run speech` streams each WAV in 100 ms chunks through the provider for the preset: the
built-in whisper.cpp engine or an OpenAI-compatible server, with the voice check and hallucination
filters. It frees the Whisper model before exit (Metal aborts otherwise).

## Servers

Built-in AI starts Typelite's own llama-server (`--llama-model`) and stops it at the end; any
OpenAI-compatible endpoint works with `--ai-url`/`--ai-model`. Nothing is sent elsewhere.

## Outputs

`summary.md` for reading, `results.json` with every sample. `--save-baseline` writes
`evals/baselines/<kind>-<model>.json`.
