# Built-in AI

How Typelite runs a local model for AI polish. Back to [index](index.md).

## Pieces

```
Typelite.app/Contents/MacOS/
  typelite            main program (whisper.cpp compiled in)
  llama-server        llama.cpp server, shipped with the app (Tauri externalBin)

~/Library/Application Support/dev.typelite.mac/models/
  ggml-*.bin          speech models (plan 0012)
  *.gguf              AI models (this plan)
```

## The llama-server binary

- Built from llama.cpp source at one pinned release tag, with Metal on and the Metal shaders
  embedded, statically linked so it needs no other files. A script in `scripts/` builds it into
  `src-tauri/binaries/llama-server-<target-triple>` (git-ignored); the Tauri config lists it as
  an external binary so it is bundled and signed with the app.
- A developer without the built binary can still build and run the app; Built-in AI then reports
  that the server is missing instead of failing to compile.
- llama.cpp is MIT; its notice goes into `THIRD_PARTY_NOTICES.md` with a note on the Qwen
  model licence (Apache-2.0).

## Models

| Id | Name | File | Size | Offered when |
|---|---|---|---|---|
| `qwen3-4b` | Best quality | Qwen3-4B-Instruct-2507 Q4_K_M GGUF | ~2.5 GB | Apple Silicon, ≥ 16 GB memory, free disk ≥ 1.1 × size |
| `qwen3-1.7b` | Faster | Qwen3-1.7B Q4_K_M GGUF | ~1.1 GB | Apple Silicon, ≥ 8 GB memory, free disk ≥ 1.1 × size |

- Files come from Hugging Face: Qwen's official repository when it has the GGUF, otherwise a
  well-known converter. The exact URL, byte size and SHA-256 (the LFS object id, read from the
  `x-linked-etag` header) are written into the model table in code, like the speech models.
- The first offered model is recommended. With one offered model it still shows as selected.
- None offered: see the "no model" rule in [index](index.md).

## Lifecycle

- The server starts when Built-in AI is the active engine and its model is present: at app
  start, after setup, and after a model change. It listens on 127.0.0.1 on a free port, with
  all layers on the GPU, a 4096-token context, and thinking disabled.
- Typelite waits for its health endpoint before sending requests; the first request after start
  may take a few seconds while the model loads.
- If it exits unexpectedly it is restarted on the next polish request. It is stopped when
  Typelite quits, when the user switches to another engine, and when the model is deleted.
- Its output goes to the Typelite log (timings, errors), never the polished text.

## Config and presets

- The AI side gets a provider kind like speech: `builtin` (model id) or the existing
  OpenAI-compatible preset. The built-in preset's base URL is filled in at runtime from the
  running server; users never see or edit it.
- The polish pipeline itself is unchanged: it sends the same chat request to whichever address
  the active preset resolves to.
- Readiness: Built-in is ready after the file is verified and one test request succeeds, shown
  as "tested on this Mac in 0.6 s".
- Existing AI presets, including local ones, keep working; the active preset stays active.
