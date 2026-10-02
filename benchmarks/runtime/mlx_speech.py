"""JSON-lines MLX speech worker; protocol matches benchmark_speech.rs."""
import importlib
import json
import sys
import time

import mlx.core as mx
import mlx_whisper
import numpy as np


model = sys.argv[1]
start = time.perf_counter()
holder = importlib.import_module("mlx_whisper.transcribe").ModelHolder
holder.get_model(model, mx.float16)
mx.synchronize()
print(json.dumps({"ready": True, "load_ms": (time.perf_counter() - start) * 1000}), flush=True)
for line in sys.stdin:
    request = json.loads(line)
    pcm = open(request["pcm"], "rb").read()
    start = time.perf_counter()
    audio = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768
    if len(audio) < 17600:
        audio = np.pad(audio, (0, 17600 - len(audio)))
    result = mlx_whisper.transcribe(
        audio,
        path_or_hf_repo=model,
        language=request.get("language"),
        task="transcribe",
        condition_on_previous_text=False,
        without_timestamps=True,
        suppress_tokens=[],
        suppress_blank=True,
        best_of=1,
        temperature=(0.0, 0.2, 0.4, 0.6, 0.8, 1.0),
        no_speech_threshold=0.6,
        logprob_threshold=-1.0,
        verbose=None,
    )
    mx.synchronize()
    print(json.dumps({
        "elapsed_ms": (time.perf_counter() - start) * 1000,
        "text": result["text"], "language": result["language"],
        "peak_metal_bytes": mx.get_peak_memory(),
    }, ensure_ascii=False), flush=True)
