# Pure-Rust inference (candle) against whisper.cpp and llama.cpp

Could Typelite drop its C++ engines (whisper.cpp for built-in speech, llama.cpp's llama-server
for built-in AI) for pure-Rust inference, with one language less and maybe more speed? This
tests [candle](https://github.com/huggingface/candle) 0.11, the most complete Rust library with
Whisper and Qwen3 on Metal, against the shipping engines on the same Mac, inputs and models.

**Decision: keep whisper.cpp and llama.cpp** ([decision](../../decisions/2026-10-05-rust-inference.md)).
candle is slower for AI polish by 2.3–2.4×, slower for long dictations, needs 5.6× the speech
model memory and changed the long polish answer's language. It would not remove all non-Rust
code either: candle's GPU path ships Metal shaders.

## Provenance

| Field | Value |
|---|---|
| Date | 2026-10-05 (UTC+8) |
| Kind | Runtime evaluation; separate schema, no baseline change |
| Machine | Apple M1 Pro, 32 GiB, macOS 26.5.2, rustc 1.98.1 (stable for the prototype) |
| Shipping engines | `main` at `c500389`: whisper-rs / whisper.cpp in-process (`examples/benchmark_speech`); bundled `llama-server` with the app's flags (`-ngl 999`, ctx 4096, `--parallel 1`, reasoning off) |
| Candidate | `benchmarks/runtime/candle/` (candle-core/nn/transformers 0.11.0, Metal): `whisper` and `qwen` workers, release, thin LTO |
| Speech models | whisper.cpp: `ggml-large-v3-turbo-q5_0.bin` (574 MB). candle: `openai/whisper-large-v3-turbo` safetensors, run in F32 (1.6 GB file, 3.2 GB in memory) |
| Text model | Both: `Qwen3-1.7B-Q4_K_M.gguf`, the app's pinned file (SHA-256 `b139949c…1897`) |
| Runs | 3 alternating fresh processes per engine; 1 first call + 5 warm per input |

Raw data: [speech.json](speech.json), [text.json](text.json).

## Method

- **Speech:** `benchmarks/runtime/cpp_speech_ab.py` drives both workers over the seven fixtures
  in `benchmarks/runtime/fixtures` with the same JSON protocol. Both use one 30 s window, auto
  language, no timestamps, greedy decoding and the app's no-speech filter. The candle worker's
  decoding loop, mel filters and language detection are written for this test around candle's
  Whisper model; no example code was copied.
- **Text:** `benchmarks/runtime/text_ab.py` sends both engines the identical raw prompt (Qwen3
  chat template, the app's polish system prompt from `docs/guides/benchmarks/data`, the short and
  long dictation), greedy, up to 512 tokens, no prompt cache. Both tokenised it to the same 2,930
  and 3,089 prompt tokens.

## Results

Lower is better for times. Medians of process medians.

### Speech (warm, ms)

| Fixture | whisper.cpp | candle | Change | Transcripts |
|---|---:|---:|---:|---|
| `en-short` 0.8 s | 2903 | 2460 | −15% | identical |
| `en` 4.1 s | 2871 | 2236 | −22% | identical |
| `silence` 4.0 s | 3001 | 2361 | −21% | identical |
| `yue` 5.6 s | 3279 | 2951 | −10% | identical |
| `mixed` 9.9 s | 3222 | 3740 | +16% | one word differs |
| `en-long` 18.3 s | 3049 | 4742 | +56% | identical |
| `yue-long` 19.0 s | 3209 | 4772 | +49% | closing phrase differs |
| Model load | 324–401 | 3672–4847 | ~11× | |
| First call after load | ~2.2–3.1 s | up to 10 s in the smoke test (Metal shader compile) | | |

candle encodes faster, so short outputs win, but its Whisper decoder keeps no self-attention
cache and re-runs the whole transcript for every token, so cost grows with the length of what
was said. whisper.cpp's times in this run are higher than in the
[encoder-window report](../2026-10-05-whisper-audio-ctx/README.md) (2.1–2.6 s); alternating with a
3.2 GB F32 model is the likely cause, so the short-clip gap is probably an upper bound. With
that change (PR #69) whisper.cpp takes ~1.0 s for short clips, below candle here.

### AI polish (warm, no prompt cache)

| Input | Metric | llama.cpp | candle | Change |
|---|---|---:|---:|---:|
| short (2,930 prompt tokens) | prefill ms | 5289 | 12281 | +132% |
| | total ms | 5485 | 12868 | +135% |
| long (3,089 prompt tokens) | prefill ms | 5967 | 14275 | +139% |
| | total ms | 9367 | 22235 | +137% |
| | decode tokens/s | 51.2 | 16.8 | −67% |
| Server/model load | ms | 850–1264 | 1694–2569 | ~2× |

Output: on the short dictation both wrote the same sentence (punctuation differs). On the long
one llama.cpp kept English (174 tokens); **candle translated the whole dictation into Simplified
Chinese** (135 tokens), from the same weights and greedy decoding. candle's Q4_K Metal kernels
round differently, enough to flip a decision the app's language guard would then have to catch.

The no-cache prefill is the worst case: the app keeps llama-server's prompt cache warm, so its
real polish time is much lower (log: 0.15–0.5 s). candle has no equivalent server-side cache.

## Limitations

- One machine, synthetic speech, one text model size (1.7B; the app's default is 4B).
- candle's Whisper supports F32 only, so its speech model is unquantized; a quantized candle
  Whisper exists only for small models in candle's own GGUF format.
- The prototypes are benchmark workers, not app integrations (no cancellation, streaming or
  lifecycle).

## Reproduce

```sh
cd benchmarks/runtime/candle && cargo +stable build --release && cd -
# speech: model folder with config.json, tokenizer.json, model.safetensors from
# huggingface.co/openai/whisper-large-v3-turbo; wrap the worker so it ignores --model
python3 benchmarks/runtime/cpp_speech_ab.py --before <whisper.cpp example> --after <candle wrapper> \
  --model <ggml model> --rounds 3 --warm 5 --out output/rust-inference/speech.json
python3 benchmarks/runtime/text_ab.py \
  --llama-server src-tauri/binaries/llama-server-aarch64-apple-darwin \
  --candle benchmarks/runtime/candle/target/release/qwen \
  --model <Qwen3-1.7B-Q4_K_M.gguf> --tokenizer <Qwen3-1.7B tokenizer.json> \
  --rounds 3 --warm 5 --out output/rust-inference/text.json
```
