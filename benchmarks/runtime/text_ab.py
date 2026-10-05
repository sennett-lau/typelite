"""A/B timing for AI polish: the bundled llama-server against a candle (pure Rust) worker.

Both get the identical raw prompt: Qwen3's chat template around the app's polish system prompt
and the short or long dictation from docs/guides/benchmarks/data, thinking off, greedy, up to
512 tokens, no prompt cache (llama-server `cache_prompt: false`; candle clears its KV cache).
Alternating fresh processes; each process makes one first call and `--warm` timed calls per
prompt. Standard library only.

    python3 benchmarks/runtime/text_ab.py --llama-server <bin> --candle <qwen bin> \
        --model <gguf> --tokenizer <tokenizer.json> --rounds 3 --out <file.json>
"""

from __future__ import annotations

import argparse
import json
import socket
import statistics
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "docs" / "guides" / "benchmarks" / "data"
# Same as CONTEXT_TOKENS in src-tauri/src/llm/builtin.rs.
CONTEXT_TOKENS = 4096


def prompt(user: str) -> str:
    system = (DATA / "polish-system-prompt.txt").read_text().strip()
    return (
        f"<|im_start|>system\n{system}<|im_end|>\n"
        f"<|im_start|>user\n{user.strip()}<|im_end|>\n"
        "<|im_start|>assistant\n<think>\n\n</think>\n\n"
    )


PROMPTS = {
    "short": prompt((DATA / "polish-short-en.txt").read_text()),
    "long": prompt((DATA / "polish-long-en.txt").read_text()),
}


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class LlamaServer:
    def __init__(self, binary: str, model: str):
        self.port = free_port()
        started = time.perf_counter()
        self.proc = subprocess.Popen(
            [binary, "--model", model, "--host", "127.0.0.1", "--port", str(self.port),
             "--n-gpu-layers", "999", "--ctx-size", str(CONTEXT_TOKENS), "--parallel", "1",
             "--reasoning", "off", "--no-webui", "--offline"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        while True:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/health", timeout=1) as r:
                    if r.status == 200:
                        break
            except OSError:
                time.sleep(0.2)
        self.load_ms = (time.perf_counter() - started) * 1000

    def complete(self, text: str, max_tokens: int) -> dict:
        body = json.dumps({"prompt": text, "n_predict": max_tokens, "temperature": 0,
                           "top_k": 1, "cache_prompt": False}).encode()
        request = urllib.request.Request(f"http://127.0.0.1:{self.port}/completion", body,
                                         {"Content-Type": "application/json"})
        started = time.perf_counter()
        with urllib.request.urlopen(request) as r:
            answer = json.load(r)
        timings = answer["timings"]
        return {
            "prefill_ms": timings["prompt_ms"],
            "total_ms": (time.perf_counter() - started) * 1000,
            "prompt_tokens": timings["prompt_n"],
            "generated_tokens": timings["predicted_n"],
            "text": answer["content"],
        }

    def close(self):
        self.proc.terminate()
        self.proc.wait()


class CandleWorker:
    def __init__(self, binary: str, model: str, tokenizer: str):
        self.proc = subprocess.Popen([binary, model, tokenizer], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        self.load_ms = json.loads(self.proc.stdout.readline())["load_ms"]

    def complete(self, text: str, max_tokens: int) -> dict:
        self.proc.stdin.write(json.dumps({"prompt": text, "max_tokens": max_tokens}) + "\n")
        self.proc.stdin.flush()
        return json.loads(self.proc.stdout.readline())

    def close(self):
        self.proc.stdin.close()
        self.proc.wait()


def run_process(engine, warm: int) -> dict:
    result = {"load_ms": engine.load_ms, "prompts": {}}
    for name, text in PROMPTS.items():
        first = engine.complete(text, 512)
        samples = [engine.complete(text, 512) for _ in range(warm)]
        result["prompts"][name] = {"first": first, "warm": samples}
    engine.close()
    return result


def pct(values, q):
    values = sorted(values)
    k = (len(values) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(values) - 1)
    return values[lo] + (values[hi] - values[lo]) * (k - lo)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--llama-server", required=True)
    ap.add_argument("--candle", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--tokenizer", required=True)
    ap.add_argument("--rounds", type=int, default=3)
    ap.add_argument("--warm", type=int, default=5)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    start = {
        "llama.cpp": lambda: LlamaServer(args.llama_server, args.model),
        "candle": lambda: CandleWorker(args.candle, args.model, args.tokenizer),
    }
    runs = {name: [] for name in start}
    for r in range(args.rounds):
        order = list(start) if r % 2 == 0 else list(reversed(start))
        for name in order:
            runs[name].append(run_process(start[name](), args.warm))
            time.sleep(2)

    summary = {}
    for prompt_name in PROMPTS:
        row = {}
        for name in start:
            warm = [s for p in runs[name] for s in p["prompts"][prompt_name]["warm"]]
            per_process = lambda key: [
                statistics.median(s[key] for s in p["prompts"][prompt_name]["warm"])
                for p in runs[name]
            ]
            row[name] = {
                "prefill_ms": statistics.median(per_process("prefill_ms")),
                "total_ms": statistics.median(per_process("total_ms")),
                "total_p10_ms": pct([s["total_ms"] for s in warm], 0.1),
                "total_p90_ms": pct([s["total_ms"] for s in warm], 0.9),
                "decode_tok_s": statistics.median(
                    s["generated_tokens"] / max(s["total_ms"] - s["prefill_ms"], 1e-9) * 1000
                    for s in warm
                ),
                "prompt_tokens": sorted({s["prompt_tokens"] for s in warm}),
                "generated_tokens": sorted({s["generated_tokens"] for s in warm}),
                "texts": sorted({s["text"] for s in warm}),
            }
        summary[prompt_name] = row

    report = {"recorded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "model": Path(args.model).name, "rounds": args.rounds, "warm": args.warm,
              "summary": summary, "runs": runs}
    Path(args.out).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    for prompt_name, row in summary.items():
        a, b = row["llama.cpp"], row["candle"]
        print(f"{prompt_name:6} prefill {a['prefill_ms']:7.1f} -> {b['prefill_ms']:7.1f} ms  "
              f"total {a['total_ms']:7.1f} -> {b['total_ms']:7.1f} ms  "
              f"decode {a['decode_tok_s']:5.1f} -> {b['decode_tok_s']:5.1f} tok/s  "
              f"tokens {a['prompt_tokens']}/{a['generated_tokens']} vs {b['prompt_tokens']}/{b['generated_tokens']}")


if __name__ == "__main__":
    main()
