# Built-in AI

How Typelite runs a local model for AI polish. Back to [index](index.md).

## Pieces

```
Typelite.app/Contents/MacOS/
  typelite            main program (whisper.cpp compiled in)
  llama-server        llama.cpp server, shipped with the app (Tauri externalBin)

~/Library/Application Support/dev.typelite.mac/
  models/ggml-*.bin   speech models (plan `quick-speech-setup`)
  models/*.gguf       AI models (this plan)
  llama-server.pid    process id of the running server, to stop one a crash left behind
```

Code: `llm/models.rs` (model table and hardware rules), `llm/builtin.rs` (the server process),
`commands/ai_setup.rs` (setup commands), `commands/model_setup.rs` (status, cancel and
download-with-progress shared with speech).

## The llama-server binary

- `scripts/build-llama-server.sh` builds it from llama.cpp source at one pinned release tag
  (`b11177`) with cmake: Metal on with the shaders embedded, static libraries, no OpenSSL or
  curl, no web UI. The only linked libraries are macOS system ones (the script checks). It writes
  `src-tauri/binaries/llama-server-<target-triple>` (git-ignored).
- The external binary is listed only in a config overlay, `src-tauri/tauri.bundle.conf.json`,
  which `npm run build:app` passes to `tauri build --config`. Reason: Tauri's build script fails
  when a listed external binary is missing, so listing it in `tauri.conf.json` would make every
  `cargo build` and `cargo test` need it. With the overlay, only bundling needs it, and the
  bundle is signed with the binary inside.
- At runtime the app looks for `llama-server` next to its executable (where Tauri puts external
  binaries), then for the triple-named file there, then (debug builds only) in
  `src-tauri/binaries/`. `TYPELITE_LLAMA_SERVER` overrides the path.
- Without the binary the app builds and runs; the AI hardware check reports the server as
  missing, and the Built-in card and Settings say "This copy of Typelite was built without the
  built-in AI server" instead of offering a setup.
- llama.cpp is MIT; its notice, and those of the libraries inside `llama-server`, are in
  `THIRD_PARTY_NOTICES.md` with a note on the Qwen model licence (Apache-2.0).

## Models

| Id | Name | File | Size | Offered when |
|---|---|---|---|---|
| `qwen3-4b` | Best quality | `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` | 2,497,281,120 bytes | Apple Silicon, ≥ 16 GB memory, free disk ≥ 1.1 × size |
| `qwen3-1.7b` | Faster | `Qwen3-1.7B-Q4_K_M.gguf` | 1,107,409,472 bytes | Apple Silicon, ≥ 8 GB memory, free disk ≥ 1.1 × size |

- Qwen's own Hugging Face repositories have no Q4_K_M GGUF of these two models (the 1.7B one
  has Q8_0 only), so the files come from Unsloth's repositories, pinned to one commit in the
  URL. The byte size and SHA-256 (the LFS object id from the `x-linked-etag` header) are in
  `llm/models.rs`, like the speech models.
- The first offered model is recommended. With one offered model it still shows as selected.
- An installed model needs no free space, but never bypasses the chip or memory rule.
- None offered (an Intel Mac, less than 8 GB, or not enough disk): see the "no model" rule in
  [index](index.md). Speech and AI share one rule-based offer (`stt::hardware::offer_by_rules`).

## Lifecycle

- The server runs when Built-in AI is the active engine, its model is present and it passed its
  test: started at app start, after setup, and after the engine changes in Settings. It
  listens on 127.0.0.1 on a free port, with all layers on the GPU (`--n-gpu-layers 999`), a
  4096-token context, one request slot, `--reasoning off` (thinking disabled; Qwen3-1.7B
  thinks by default), `--offline` and no web UI.
- Each start gets a new random API key, passed in the environment (`LLAMA_API_KEY`) so it never
  shows on a command line; requests send it as a bearer token. Other programs and web pages on
  this Mac therefore cannot use the server, whatever its CORS settings.
- Typelite waits for `/health` before sending requests (up to four minutes: the first start
  after install or update compiles the Metal shaders, which takes one to two minutes; macOS
  caches the result and later starts take a few seconds).
- If it exits unexpectedly it is started again on the next polish request. It is stopped when
  Typelite quits, when the user switches to another engine, and when its model is deleted. A
  server left by a crashed Typelite is found through the pid file and stopped at the next start.
- Its output goes to the Typelite log filtered to errors, the load and listen lines and the
  per-request timing totals. At its default verbosity llama-server never prints the prompt or
  the answer.

## Config and presets

- AI presets get a kind like speech: `builtin` (model id and model file) or
  `openai_compatible`. Every config has the "Built-in (this Mac)" AI preset
  (`builtin-ai-this-mac`); a new config starts on it. Its base URL is never stored: Polish, Ask
  and Test fill it in from the running server (`llm::builtin::resolve_preset`), starting it when
  needed.
- The polish pipeline itself is unchanged: it sends the same chat request to whichever address
  the active preset resolves to. A server that cannot start makes the polish fail the way an
  unreachable server does (the raw transcript is kept).
- Readiness: Built-in is ready after the file is verified and one test request succeeds (a
  short clean-up of one sentence; an empty answer fails), shown as "tested on this Mac in 0.6 s".
- Template version 3 adds the Built-in preset. The old AI templates (Ollama on this Mac, Ollama
  on another computer, OpenAI, Groq) leave the list unless the user edited, picked or tested
  them; those that stay become ordinary user presets. The active preset stays active and keeps
  its Test result.
