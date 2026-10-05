# Built-in speech: encoder window sized to the clip

Built-in speech (whisper.cpp, large-v3-turbo Q5_0) took 2.1–2.6 s for every dictation, whatever
its length: whisper encodes a full 30 s window even for a 1 s "Send it now.". The encoder now
gets a window of at least 15 s and at least 1.5 times the clip (`audio_ctx_for` in
`src-tauri/src/stt/builtin.rs`), and the full window from 20 s of audio on. Short dictations
transcribe about **52–58% faster** (about 1.1–1.4 s saved each time) with the same transcripts in
English and equivalent ones in Cantonese. Plan `whisper-audio-ctx`.

## Provenance

| Field | Value |
|---|---|
| Report date and time zone | 2026-10-05, UTC+8 (raw data in UTC) |
| Kind | Performance improvement (real inference; separate schema) |
| PR | See the PR that adds this report |
| Previous baseline report | [2026-10-03-dictionary-work](../2026-10-03-dictionary-work/README.md) (unchanged) |
| Base revision | `c500389` (main); before binary SHA-256 `7ac4d80e…2f7b` |
| Candidate | base + this change; after binary SHA-256 `60b7142b…06b4` |
| Harness | `benchmarks/runtime/cpp_speech_ab.py` driving `src-tauri/examples/benchmark_speech.rs` (unchanged example), same for both |
| Hardware, OS and toolchain | Apple M1 Pro, 32 GiB, macOS 26.5.2, rustc 1.98.1, release profile, Metal + flash attention |
| Model | `ggml-large-v3-turbo-q5_0.bin`, SHA-256 `39422170…a7e2` |
| Process runs / warmup / measured samples | 3 alternating fresh processes per build; 1 first call + 5 warm per fixture |

Raw data: [ab-final.json](ab-final.json) (the result below), [aa-noise.json](aa-noise.json)
(before vs before), [ab-clip-sized-rejected.json](ab-clip-sized-rejected.json) (first candidate),
[grid-min-512.json](grid-min-512.json), [grid-min-768.json](grid-min-768.json),
[grid-min-1024.json](grid-min-1024.json) (minimum-window search, 1 round each).

## Change and hypothesis

- **Cost:** the A/A run shows 2.6–3.0 s for a 0.8 s clip and for an 18 s clip alike, so the
  time does not follow the audio; whisper pads every clip to 30 s and the encoder runs on all of it.
- **Change:** set whisper's `audio_ctx` (encoder frames, 50 per second, 1500 = 30 s) to
  `max(768, 1.5 × clip frames)` rounded up to 64; 0 (full window) once that reaches 1500.
- **Must stay the same:** transcripts, language detection, the no-speech filters; anything 20 s
  or longer runs exactly as before.
- **Rejected after measurement:**
  - Window = clip + 1 s: 36–87% faster but Cantonese and the 0.8 s clip became garbage text, the
    mixed clip lost its Chinese half, silence became "Thank you." ([raw](ab-clip-sized-rejected.json)).
  - Minimum 512 frames (≈10 s): correct except the mixed clip lost its Chinese half.
  - Minimum 1024 frames (≈20 s): correct but only 36–42% faster than base.

## Results

Lower is better. Warm median of process medians [pooled p10, p90], ms. Error rate: words for
English, characters for Chinese, against the fixture's reference (synthetic speech; the Chinese
references are Cantonese, whisper writes standard Chinese, so those rates are high on both sides).

| Fixture (length) | Before | After | Change | Error before → after | Transcript |
|---|---:|---:|---:|---|---|
| `en-short` (0.8 s) | 2323 [2089, 2523] | 988 [985, 1133] | −57.5% | 0.00 → 0.00 | identical |
| `en` (4.1 s) | 2140 [2138, 2471] | 1032 [1030, 1034] | −51.8% | 0.21 → 0.21 | identical |
| `silence` (4.0 s) | 2371 [2084, 2457] | 981 [978, 1218] | −58.6% | — | identical ("you", dropped later by the hallucination guard) |
| `yue` (5.6 s) | 2145 [2142, 2498] | 1033 [1031, 1279] | −51.8% | 0.33 → 0.29 | differs in one word and the closing phrase |
| `mixed` (9.9 s) | 2384 [2211, 2584] | 1101 [1096, 1247] | −53.8% | 0.20 → 0.20 | punctuation spacing only |
| `en-long` (18.3 s) | 2536 [2281, 2668] | 2147 [2141, 2627] | −15.4% | 0.02 → 0.02 | identical; inconclusive (ranges overlap) |
| `yue-long` (19.0 s) | 2565 [2289, 2711] | 2240 [2236, 2804] | −12.7% | 0.33 → 0.32 | one word and the closing phrase; inconclusive |

Model load and first calls are not changed by this (first-call medians are in the raw data).

## Validation and limitations

- `cargo test --lib` (including `audio_ctx_is_at_least_15_s_and_one_and_a_half_clips`), the full
  offline gate, and the transcripts above.
- Noise: the A/A run differed by up to 20% between processes; builds alternated order each round,
  and the short-clip gains (>50%, non-overlapping ranges) are far outside it.
- All audio is synthesised with `say` (Samantha, Sinji). Real voices, accents, noise and
  dictations with long pauses are not covered; a smaller window is the known risk for whisper
  accuracy, which is why the minimum is conservative. Watch reports of cut or garbled short
  dictations after release.
- Only large-v3-turbo was measured. The `small` built-in model uses the same window rule.
- Excluded: AI polish, paste, the speech check, servers other than built-in speech.

## Reproduce

```sh
# before: on c500389
cargo build --manifest-path src-tauri/Cargo.toml --release --example benchmark_speech
cp src-tauri/target/release/examples/benchmark_speech /tmp/before
# after: on this branch, same command, copy to /tmp/after
python3 benchmarks/runtime/cpp_speech_ab.py --before /tmp/before --after /tmp/after \
  --model "$HOME/Library/Application Support/dev.typelite.mac/models/ggml-large-v3-turbo-q5_0.bin" \
  --rounds 3 --warm 5 --out output/benchmarks/whisper-audio-ctx.json
```

The harness and the three new fixtures (`en-short`, `en-long`, `yue-long`) are added by this
change and work unchanged against the base build; the example binary is the same on both.

## Baseline decision

The application-overhead baseline (`baseline.json`) stays unchanged: none of its workloads touch
speech inference, and real-inference results use their own schema (as for the
[MLX evaluation](../2026-10-03-mlx-runtime-evaluation/README.md)).
