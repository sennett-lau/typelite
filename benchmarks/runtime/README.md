# Real inference experiments

These opt-in benchmarks load real models on an Apple silicon Mac. They do not run
in CI or change application settings. The first evaluation is recorded in
[the MLX report](../../docs/benchmarks/reports/2026-10-03-mlx-runtime-evaluation/README.md).

## Setup

Use Python 3.12, `uv`, Rust, and the application's bundled llama-server. The pinned
Python environment is an experiment dependency, not a shipping dependency.

```sh
uv venv --python 3.12 output/mlx-evaluation/venv
uv pip install --python output/mlx-evaluation/venv/bin/python -r benchmarks/runtime/requirements.txt
cargo build --manifest-path src-tauri/Cargo.toml --release --example benchmark_speech
```

Speech fixtures are committed WAV files with hashes, expected transcripts and
language settings in `fixtures/manifest.json`. To deliberately replace them, run
`output/mlx-evaluation/venv/bin/python scripts/benchmark-runtime.py prepare` on
macOS with `say` and `ffmpeg`. This changes the workload: do not compare different
fixture hashes. The mixed clip concatenates Cantonese, 250 ms silence and English;
it is not a natural code-switching recording.

Download the pinned MLX speech conversion:

```sh
output/mlx-evaluation/venv/bin/python - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download("mlx-community/whisper-large-v3-turbo",
    revision="a4aaeec0636e6fef84abdcbe3544cb2bf7e9f6fb",
    local_dir="output/mlx-evaluation/models/whisper",
    allow_patterns=["config.json", "weights.safetensors"])
PY
```

## Run

Run without other inference, builds or tests competing for resources. The runner
alternates engine order across three process pairs and records the first call to
each workload separately from five subsequent warm samples. It saves completed
process results after each engine and stops only the subprocesses it owns.

```sh
output/mlx-evaluation/venv/bin/python scripts/benchmark-runtime.py speech \
  --cpp-model "$HOME/Library/Application Support/dev.typelite.mac/models/ggml-large-v3-turbo-q5_0.bin" \
  --mlx-model output/mlx-evaluation/models/whisper \
  --output output/mlx-evaluation/speech.json
```

The Rust worker invokes production `LocalWhisper`, including PCM conversion,
padding, Metal, flash attention and segment filtering. MLX uses the same PCM,
language, no prior-text context, no timestamps, blank suppression and nominal
temperature fallback schedule. Neither worker invokes the outer provider's voice
activity/hallucination guard or Chinese-script conversion. Silence hallucinations
in this raw engine experiment must not be described as the app's output.
The libraries' fallback decisions and numerical kernels are not identical.

The `text` suite accepts `--cpp-model` and `--mlx-model` similarly. It launches
local OpenAI-compatible servers with one active request and greedy decoding,
thinking disabled, a 512-token output cap, and the existing full dictation prompt.
It measures streamed client wall time and time to first nonempty content delta.
Short/long cases reuse prompts; the cache-miss case changes the early system
prefix on every request. Native full-precision KV caches are retained, with one
MLX cache entry and one llama.cpp slot. Text readiness is HTTP readiness, which
need not mean the model has finished loading; also inspect first-request latency.

All timing values are milliseconds. `peak_rss_bytes_sampled_250ms` is the maximum
observed process RSS, sampled every 250 ms, not total system memory or a precise
Metal allocation measurement. Ready/first-call timings use new processes but
warm OS filesystem and shader caches after setup; they are not reboot-cold times.
Quantization, runtime revisions and model hashes belong with every archived
report. Compare the median of process medians and pooled p10/p90 warm samples,
and inspect all returned text and finish reasons before drawing conclusions.

## Quantized speech and text models

Quantize the downloaded FP16 speech model without downloading another checkpoint:

```sh
output/mlx-evaluation/venv/bin/python benchmarks/runtime/quantize_whisper.py \
  output/mlx-evaluation/models/whisper output/mlx-evaluation/models/whisper-4bit
```

Then repeat the speech command with `--mlx-model output/mlx-evaluation/models/whisper-4bit`
and a different output file. The script uses MLX affine 4-bit weights with group
size 64, following [the upstream quantization API](https://github.com/ml-explore/mlx-examples/blob/main/whisper/convert.py).
It refuses to overwrite a destination or re-quantize a quantized source.

For text, download the same Qwen3-1.7B checkpoint in the two runtime formats:

```sh
output/mlx-evaluation/venv/bin/python - <<'PY'
from huggingface_hub import snapshot_download, hf_hub_download
snapshot_download("mlx-community/Qwen3-1.7B-4bit",
    revision="3b1b1768f8f8cf8351c712464f906e86c2b8269e",
    local_dir="output/mlx-evaluation/models/qwen-mlx",
    allow_patterns=["*.json", "*.txt", "*.safetensors"])
hf_hub_download("unsloth/Qwen3-1.7B-GGUF", "Qwen3-1.7B-Q4_K_M.gguf",
    revision="d7f544eead698dbd1f15126ef60b45a1e1933222",
    local_dir="output/mlx-evaluation/models/qwen-cpp")
PY

output/mlx-evaluation/venv/bin/python scripts/benchmark-runtime.py text \
  --cpp-model output/mlx-evaluation/models/qwen-cpp/Qwen3-1.7B-Q4_K_M.gguf \
  --mlx-model output/mlx-evaluation/models/qwen-mlx \
  --output output/mlx-evaluation/text.json

output/mlx-evaluation/venv/bin/python benchmarks/runtime/summarize.py \
  output/mlx-evaluation/speech.json output/mlx-evaluation/text.json
```

Q4_K_M and MLX 4-bit are different quantizations. These compare usable runtime and
model-format combinations, not identical mathematical weights. Preserve all
results, including slow or inaccurate candidates. Text quality probes run after
the timed workloads and are stored separately in `quality`; they are not part of
the warm latency summary. A failed run has no `finished_at` and the summarizer
rejects it. The local-overhead baseline promotion command intentionally does not
consume this separate schema.
