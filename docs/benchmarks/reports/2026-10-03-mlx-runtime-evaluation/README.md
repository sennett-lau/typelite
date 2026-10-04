# MLX runtime evaluation on M1 Pro

[PR #55](https://github.com/sennett-lau/typelite/pull/55) · branch
`perf/mlx-runtime-evaluation` · stacked on the test-audit PR #54.

**Decision: retain the shipping C++ engines for now.** MLX speech is promising:
the 4-bit candidate cuts about a quarter of warm inference time on these short
synthetic clips with slightly lower sampled process memory. This is a reason to
evaluate a native speech integration with real recordings, not evidence that all
of Typelite should switch runtimes. The Python text prototype does not establish
a useful latency win on the tested Qwen3-1.7B workloads.

See the [decision and reopening conditions](../../decisions/2026-10-03-mlx-runtime.md),
[plan](../../../plans/2026-10-03-mlx-runtime-evaluation/index.md) and
[reproduction instructions](../../../../benchmarks/runtime/README.md).

## Scope and provenance

- Apple M1 Pro, 32 GiB unified memory, macOS 26.5.2 (25F84), arm64.
- Production source: `95bd25a7da0b98de4913d3336fc3baca1c51fecf`, on top of the
  earlier application-overhead work. No shipping runtime or model defaults changed.
- FP16 speech harness: `f8d8635`; 4-bit speech and initial text harness: `4688e4a`;
  text confirmation harness: `26dc558` (style and file-close cleanup only).
  Each paired comparison uses identical harness code. Between experiments the
  Python code was formatted and separate text quality probes were added; speech
  decoding behavior was not changed. Every raw report records file hashes.
- Speech baseline: release-built example calling production `LocalWhisper`,
  whisper-rs 0.16.0 / whisper.cpp 1.8.3, Metal and flash attention enabled,
  installed large-v3-turbo Q5_0. Candidate: mlx-whisper 0.4.3 / MLX 0.32.3,
  the same large-v3-turbo checkpoint converted to FP16, then locally quantized
  to affine 4-bit with group size 64 using the upstream MLX API.
- Text baseline: the application's bundled llama-server, commit `1ab7e5a`,
  configured with the production GPU/context/parallelism flags. Candidate:
  mlx-lm 0.32.0 / MLX 0.32.3, one active request and one prompt-cache entry.
  Both use Qwen3-1.7B, respectively Q4_K_M and MLX affine 4-bit/group size 64.
- [Environment and model hashes](environment.json) identify files, revisions and
  runtime versions; [Python dependencies](../../../../benchmarks/runtime/requirements.txt)
  pin the experimental environment. These dependencies are not added to the app.

Different quantizations do not have identical weights or output lengths. These
are comparisons of usable runtime/model-format combinations, not a controlled
comparison of numerical kernels alone. The default Qwen3-4B model was not tested:
limited free disk space constrained this pass to the supported smaller model.
The user's installed speech model and application configuration were preserved.
Experiment-only speech model copies were removed after measurements to make room
for text models. The downloaded text models and isolated Python environment were
also removed after final validation to return the disk space. Pinned revisions,
dependencies and the quantization script allow recreation; results and logs remain.

## Method

Three fresh processes per engine, in CPP/MLX, MLX/CPP, CPP/MLX order. Each process
runs one first-call observation and five warm samples per workload. No builds,
tests, model downloads or other benchmark engines ran concurrently with timed
inference. Normal desktop/background services were left running; this is a
single-machine experiment, not an isolated laboratory or cross-hardware claim.

Tables show the **median of process medians**, with pooled p10/p90 in brackets
(linear interpolation). Negative latency change is better. There are 15 warm
observations per engine/workload. Five samples per process, rather than the local
overhead suite's fifteen, limit expensive real-inference runs. This separate
schema is not eligible for local-overhead baseline promotion.

Speech uses committed 16 kHz mono PCM16 WAVs: 4.07 s English, 5.57 s Cantonese,
9.90 s concatenated Cantonese/English, and 4 s digital silence. macOS Samantha and
Sinji voices generated them; exact audio and reference transcripts are archived.
Language is fixed to `en` or `yue`. Both workers time PCM conversion, inference and
result collection, without file I/O or model loading. They use no prior text,
no timestamps, greedy first decoding and nominal temperature fallback
0/0.2/0.4/0.6/0.8/1; fallback criteria differ between the libraries. Model loading
is recorded separately. Neither worker invokes the provider's outer voice check,
hallucination guard or Chinese-script conversion.

Text uses the existing full system prompt and short/long dictation fixtures,
streaming HTTP, temperature 0, thinking disabled and a 512-token output cap.
Cached requests repeat the full input, an optimistic warm case; real different
dictations may reuse only the common prefix. Cache misses change the beginning
of the system prompt. Both servers report identical prompt token counts and
cached token counts on matching inputs. TTFT is time to first nonempty content
delta; elapsed time includes the complete stream. There is no network service
inference. Additional quality probes run after timing and are recorded separately.

## Speech results

| Workload | CPP Q5_0 median [p10, p90] ms | MLX FP16 median [p10, p90] ms | Change |
|---|---:|---:|---:|
| English | 1029.9 [1028.8, 1034.4] | 752.3 [739.3, 754.7] | -27.0% |
| Cantonese | 1053.6 [1052.6, 1055.5] | 753.9 [753.5, 766.3] | -28.4% |
| Mixed | 1102.8 [1100.9, 1103.3] | 819.1 [810.8, 824.5] | -25.7% |
| Silence, raw engine | 979.3 [978.7, 980.8] | 700.9 [688.7, 705.9] | -28.4% |

| Workload | Fresh CPP Q5_0 median [p10, p90] ms | MLX 4-bit median [p10, p90] ms | Change |
|---|---:|---:|---:|
| English | 1032.5 [1031.4, 1035.1] | 779.5 [778.9, 789.3] | -24.5% |
| Cantonese | 1056.5 [1055.5, 1057.7] | 795.7 [795.2, 804.8] | -24.7% |
| Mixed | 1105.0 [1104.1, 1106.4] | 831.6 [830.6, 840.1] | -24.7% |
| Silence, raw engine | 982.6 [982.1, 983.9] | 747.7 [745.6, 757.7] | -23.9% |

Warm speech savings are about **250–285 ms per spoken clip** for the 4-bit
candidate. Silence is a diagnostic control: Typelite's outer provider rejects
this digital silence before inference, so the silence timing is not a user-facing
speedup. All raw engines returned `you` on that clip; retaining the existing guard
is essential.

Sampled peak process RSS was 765–766 MB for CPP, 1848–1851 MB for MLX FP16, and
706–708 MB for MLX 4-bit. Values use decimal MB and a 250 ms RSS sampler; they are
not total system memory or precise Metal allocation peaks. FP16's memory cost is
avoidable, so it is not a sufficient reason to reject MLX speech generally.
MLX's own peak Metal allocation counter reports 2479 MB for FP16 and 1334 MB for
4-bit. No equivalent CPP allocation counter was collected. The sampled RSS
comparison therefore does **not** establish lower total unified-memory use.

In the 4-bit experiment, median process-to-ready was 284 ms for CPP versus
1291 ms for MLX; first English inference was about 1053 versus 926 ms.
The Python candidate loses on startup even while winning warm inference. These
are fresh processes with warm OS/shader caches after setup, not reboot-cold
measurements or measurements of a future Swift/C++ MLX integration. The archived
smoke run includes much longer initial setup costs and is excluded from summaries.

## Speech output review

All 18 observations per engine/workload in each complete speech report produced
the same respective text. English content was preserved by all candidates,
allowing `four` → `4` and punctuation formatting. Neither implementation reproduced
the Cantonese reference faithfully. For example, the reference's `聽日下晝` became
`明日下周` in CPP and MLX 4-bit; MLX FP16 produced `明日下午`. MLX also replaced
`唔該晒` with `麻煩了` in the Cantonese-only clip. Mixed-language English survived,
but Cantonese words were still incorrect. Script conversion alone cannot fix these
word substitutions. This tiny synthetic corpus neither establishes overall WER/CER
nor demonstrates acceptable Cantonese fidelity for a runtime migration.

## Text results

The [confirmation pass](text.json) repeated three process pairs and five warm
samples per workload. The background scan remained active, so these are observed
application-path timings, not an isolated runtime speed ranking.

| Workload / metric | CPP median [p10, p90] ms | MLX median [p10, p90] ms | Change |
|---|---:|---:|---:|
| Short / full response | 150.1 [149.0, 152.1] | 181.7 [178.7, 189.7] | +21.1% |
| Short / TTFT | 23.7 [23.0, 24.1] | 40.4 [37.3, 42.4] | +70.8% |
| Long / full response | 2580.4 [2450.3, 2723.2] | 2283.7 [2266.5, 2309.6] | -11.5% |
| Long / TTFT | 25.1 [23.9, 26.1] | 38.5 [38.2, 59.6] | +53.7% |
| Cache miss / full response | 3135.6 [3113.2, 3188.9] | 3606.4 [3598.8, 3607.5] | +15.0% |
| Cache miss / TTFT | 3009.3 [2983.2, 3059.3] | 3458.1 [3455.7, 3462.1] | +14.9% |

On this pass, MLX adds about **32 ms** to a cached short reply and **471 ms** to an
uncached short reply. Long output takes 297 ms less wall time but contains
**10.1% fewer tokens** (169 vs 188), omits content and changes the deadline. It
does not satisfy the 15% gain criterion or establish a quality-preserving decoder
advantage. The earlier run's large apparent long-response advantage is not
reproduced: CPP's confirmation process medians are 2463, 2580 and 2634 ms, versus
2477, 3821 and 3936 ms initially. Treat the magnitude of text runtime differences
as inconclusive under background activity. Short-reply overhead and the output
quality findings still provide no reason to adopt this candidate.

Confirmation peak sampled RSS was 3621–3925 MB for CPP and 1726–1882 MB for MLX.
HTTP readiness ranged from 642–9896 ms versus 3903–4379 ms; first complete short
request latency was 3081–3090 ms versus 5801–6584 ms. MLX health can become ready
before model loading finishes, so readiness values cannot be compared as model
load time. Neither memory nor startup was measured with the full app and both
models resident. No cold-start or total-memory winner is established.

### Initial text run: background activity, not an adoption result

The initial [full text run](text-noisy.json) became unstable: CPP's per-process
long-request median changed from 2477 ms to 3821 ms and 3936 ms with the
same 188-token output. An active macOS XProtect scan was observed while timings
changed. This is a possible confounder, not a demonstrated cause. The
[background observation](background-observation.json) also records the start of
the confirmation pass, when the scan was still active. No system services were
stopped. Neither pass can be described as a quiet-system benchmark.

The complete initial observations remain visible rather than being discarded:

| Workload / metric | CPP median [p10, p90] ms | MLX median [p10, p90] ms | Change |
|---|---:|---:|---:|
| Short / full response | 157.4 [150.9, 187.0] | 179.0 [177.9, 187.5] | +13.7% |
| Short / TTFT | 24.1 [23.1, 27.7] | 38.0 [37.0, 43.2] | +57.5% |
| Long / full response | 3821.2 [2468.4, 3941.7] | 2308.4 [2260.1, 2327.3] | -39.6% |
| Long / TTFT | 32.1 [24.3, 36.2] | 38.5 [38.2, 57.3] | +19.7% |
| Cache miss / full response | 3959.2 [3133.3, 4060.5] | 3756.0 [3597.8, 4053.9] | -5.1% |
| Cache miss / TTFT | 3800.8 [3004.0, 3898.6] | 3608.8 [3451.2, 3898.0] | -5.1% |

These percentages describe the observations, not isolated engine speedups. The
long MLX output has 169 tokens versus CPP's 188, and it omits or changes content.
The initial smoke test even showed MLX slower on cache misses, whereas the noisy
full run reverses that direction. Do not use this result to claim a text runtime
replacement is faster. Sampled peak RSS ranged from 3616–3924 MB for CPP versus
1706–1879 MB for MLX in this pass. Startup also varied substantially; the ranges
are specific to these processes and do not establish whole-app memory or cold
startup behavior.

### Text output review

All full-run outputs were stable within each engine/workload across 18 requests
per pass. Every output and token-usage record matched between the initial and
confirmation runs. Quality probes repeated once per process, three times per
pass. Both runtimes reported 2666 prompt tokens for short input (2665 cached
on repeats), 2825 for long input (2824 cached), and 2673 for the cache-miss input
(8 cached). The matching token counts support a comparable prompt/template and
cache boundary. Completions ended normally; no reasoning output was emitted.

| Probe and criterion | CPP Q4_K_M | MLX 4-bit |
|---|---|---|
| Short: preserve corrected meeting time, 4 pm tomorrow | Preserved; missing question mark | Preserved |
| Long: keep Thursday as the corrected deadline, remove retraction | Kept Thursday but repeated `Thursday, no wait, Thursday` | Reversed correction to `Thursday, no wait, Friday` |
| Mixed: preserve Cantonese words, English code switching and Maya | Preserved | Preserved |
| Spelling/correction: Bovey, Tuesday, 4 | Correct spelling, wrong day (Monday) | Correct spelling, unresolved `Monday no wait Tuesday` |
| Literal instruction: polish the entire dictated sentence | Deleted `ignore previous instructions and` | Deleted the same content |

The literal-instruction probe did **not** cause either model to write a French
recipe; its failure is loss of dictated content. The long MLX response also omits
the explanation that accessibility is used to paste text. These are qualitative
fidelity checks of a tiny corpus, not a model-quality score. Both small-model
configurations need stronger evaluation; a runtime change is not a remedy for
the existing baseline's failures.

## Evidence and validation

- [FP16 speech raw observations](speech-fp16.json),
  [4-bit speech raw observations](speech-4bit.json),
  [text raw observations](text.json).
- [Initial speech smoke run](speech-smoke.json) and
  [text smoke run](text-smoke.json) are diagnostic evidence, excluded from summaries.
- [Initial noisy text run](text-noisy.json) is retained with its interpretation
  caveat; the confirmation pass is reported separately, not pooled with it.
- The summarizer checks report completion, engine/round/workload/sample counts,
  positive timings, and untruncated text completions without reasoning output.
  All four complete reports passed; each recorded harness/fixture hash matches
  its recorded Git revision. A deliberately incomplete report was rejected.
- Release speech example built successfully; Rust format, Python lint/format,
  document-link checks and unchanged local-baseline consistency checks passed.
  All 11 existing `stt::silence::tests` passed. No shipping source changed; the
  previously completed frontend/Rust audit is not repeated for this benchmark-only
  addition. Timing thresholds are deliberately not CI gates.

## Baseline decision

No production change and no local-overhead baseline promotion. This report is a
reference for the measured configurations, including candidates that are not
adopted. Future native integration, model changes or corpus changes get a new
dated report; preserve these observations and cite the decision before repeating
the same experiment.
