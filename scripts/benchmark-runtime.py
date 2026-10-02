#!/usr/bin/env python3
"""Opt-in real inference evaluation. See benchmarks/runtime/README.md."""
import argparse
import hashlib
import json
import os
import platform
import queue
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import wave
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "benchmarks/runtime/fixtures"
SCRATCH = ROOT / "output/mlx-evaluation"
PYTHON = SCRATCH / "venv/bin/python"
DATA = ROOT / "docs/guides/benchmarks/data"


def sha(path):
    with open(path, "rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def prepare():
    FIXTURES.mkdir(parents=True, exist_ok=True)
    SCRATCH.mkdir(parents=True, exist_ok=True)
    specs = [
        ("en", "Samantha", (DATA / "speech-short-en.txt").read_text().strip(), "en"),
        ("yue", "Sinji", "我聽日下晝四點開會，記得幫我準備份報告，唔該晒。", "yue"),
    ]
    manifest = []
    for name, voice, text, language in specs:
        aiff = SCRATCH / f"{name}.aiff"
        wav = FIXTURES / f"{name}.wav"
        subprocess.run(["say", "-v", voice, "-r", "180", "-o", str(aiff), text], check=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(aiff),
                        "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(wav)], check=True)
        manifest.append(dict(id=name, voice=voice, reference=text, language=language))
    with wave.open(str(FIXTURES / "en.wav")) as file:
        en = file.readframes(file.getnframes())
    with wave.open(str(FIXTURES / "yue.wav")) as file:
        yue = file.readframes(file.getnframes())
    for name, pcm, language, reference in [
        ("mixed", yue + bytes(8000) + en, "yue", specs[1][2] + " " + specs[0][2]),
        ("silence", bytes(4 * 16000 * 2), "en", ""),
    ]:
        with wave.open(str(FIXTURES / f"{name}.wav"), "wb") as file:
            file.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
            file.writeframes(pcm)
        manifest.append(dict(id=name, reference=reference, language=language))
    for entry in manifest:
        path = FIXTURES / f"{entry['id']}.wav"
        entry["sha256"] = sha(path)
        with wave.open(str(path)) as file:
            entry["duration_s"] = file.getnframes() / file.getframerate()
    (FIXTURES / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


class Child:
    """Own only the process we launch; bound readiness/response waits and always stop it."""
    def __init__(self, command, log):
        self.command, self.log_path = command, log
        self.lines = queue.Queue()
        self.peak_rss = 0
        self.stop = threading.Event()

    def __enter__(self):
        self.log = open(self.log_path, "w")
        env = {k: v for k, v in os.environ.items() if not k.startswith("LLAMA_ARG_")}
        env.update(HF_HUB_OFFLINE="1", TOKENIZERS_PARALLELISM="false")
        self.start = time.perf_counter()
        self.process = subprocess.Popen(self.command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=self.log, text=True, bufsize=1, env=env, cwd=ROOT)
        def read():
            for line in self.process.stdout:
                self.lines.put(line)
            self.lines.put(None)
        def memory():
            while not self.stop.is_set():
                result = subprocess.run(["ps", "-o", "rss=", "-p", str(self.process.pid)],
                                        capture_output=True, text=True)
                if result.stdout.strip():
                    self.peak_rss = max(self.peak_rss, int(result.stdout.strip()) * 1024)
                self.stop.wait(0.25)
        self.reader = threading.Thread(target=read, daemon=True)
        self.monitor = threading.Thread(target=memory, daemon=True)
        self.reader.start()
        self.monitor.start()
        return self

    def response(self):
        line = self.lines.get(timeout=180)
        if line is None:
            raise RuntimeError(f"Worker exited; see {self.log_path}")
        return json.loads(line)

    def ask(self, request):
        self.process.stdin.write(json.dumps(request) + "\n")
        self.process.stdin.flush()
        return self.response()

    def __exit__(self, *_):
        self.process.terminate()
        try:
            self.process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        self.stop.set()
        self.monitor.join()
        self.reader.join(timeout=1)
        self.process.stdin.close()
        self.process.stdout.close()
        self.log.close()


def speech(args, engine, round_id, child, result):
    ready = child.response()
    result.update(ready, ready_ms=(time.perf_counter() - child.start) * 1000)
    for entry in json.loads((FIXTURES / "manifest.json").read_text()):
        wav = FIXTURES / f"{entry['id']}.wav"
        if sha(wav) != entry["sha256"]:
            raise ValueError(f"Changed fixture: {wav}")
        with wave.open(str(wav)) as file:
            assert (file.getnchannels(), file.getsampwidth(), file.getframerate()) == (1, 2, 16000)
            pcm = SCRATCH / f"{entry['id']}.pcm"
            pcm.write_bytes(file.readframes(file.getnframes()))
        for sample in range(args.samples + 1):
            response = child.ask(dict(pcm=str(pcm), language=entry["language"]))
            result["samples"].append(dict(workload=entry["id"], phase="first" if sample == 0 else "warm",
                                          sample=sample, **response))
        print(f"round {round_id + 1} {engine} {entry['id']}: {response['elapsed_ms']:.0f} ms", flush=True)


def request_json(url):
    with urllib.request.urlopen(url, timeout=2) as response:
        return json.load(response)


def text_request(base, model, system, content):
    body = dict(model=model, messages=[dict(role="system", content=system),
                dict(role="user", content=f"<transcription>{content}</transcription>")],
                stream=True, stream_options=dict(include_usage=True), temperature=0,
                max_tokens=512, seed=0, top_p=1, top_k=1, min_p=0,
                chat_template_kwargs=dict(enable_thinking=False), cache_prompt=True)
    request = urllib.request.Request(base + "/v1/chat/completions", data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json"})
    start = time.perf_counter()
    text, reasoning, first_ms, usage, finish_reason = "", "", None, {}, None
    with urllib.request.urlopen(request, timeout=180) as response:
        for line in response:
            if not line.startswith(b"data: ") or line.strip() == b"data: [DONE]":
                continue
            chunk = json.loads(line[6:])
            usage = chunk.get("usage") or usage
            for choice in chunk.get("choices", []):
                delta = choice.get("delta", {})
                content = delta.get("content") or ""
                if content and first_ms is None:
                    first_ms = (time.perf_counter() - start) * 1000
                text += content
                reasoning += delta.get("reasoning_content") or delta.get("reasoning") or ""
                finish_reason = choice.get("finish_reason") or finish_reason
    return dict(elapsed_ms=(time.perf_counter() - start) * 1000, ttft_ms=first_ms,
                text=text, reasoning=reasoning, usage=usage, finish_reason=finish_reason)


def polish(args, engine, round_id, child, result, port):
    base = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + 180
    while True:
        try:
            request_json(base + "/health")
            break
        except (urllib.error.URLError, TimeoutError):
            if child.process.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError(f"Server not ready; see {child.log_path}")
            time.sleep(0.1)
    result["ready_ms"] = (time.perf_counter() - child.start) * 1000
    model = request_json(base + "/v1/models")["data"][0]["id"]
    system = (DATA / "polish-system-prompt.txt").read_text().strip()
    for workload in ["short", "long", "short-cache-miss"]:
        content = (DATA / f"polish-{'long' if workload == 'long' else 'short'}-en.txt").read_text().strip()
        for sample in range(args.samples + 1):
            # An early changed prefix invalidates almost all of the shared system prompt.
            prompt = (f"Benchmark run {round_id}-{sample}.\n" if workload.endswith("miss") else "") + system
            response = text_request(base, model, prompt, content)
            result["samples"].append(dict(workload=workload, phase="first" if sample == 0 else "warm",
                                          sample=sample, **response))
        print(f"round {round_id + 1} {engine} {workload}: {response['elapsed_ms']:.0f} ms", flush=True)


def run(args):
    SCRATCH.mkdir(parents=True, exist_ok=True)
    report = dict(schema_version=1, suite=args.suite, started_at=datetime.now(timezone.utc).isoformat(),
                  revision=subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
                  machine=platform.platform(), chip=subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], text=True).strip(),
                  rounds=args.rounds, warm_samples=args.samples, runs=[])
    paths = [Path(__file__), ROOT / "benchmarks/runtime/mlx_speech.py", ROOT / "src-tauri/examples/benchmark_speech.rs",
             ROOT / "benchmarks/runtime/requirements.txt"]
    paths += list(FIXTURES.glob("*")) if args.suite == "speech" else list(DATA.glob("polish-*.txt"))
    report["harness_and_fixture_sha256"] = {str(p.relative_to(ROOT)): sha(p) for p in paths}
    for round_id in range(args.rounds):
        for engine in (["cpp", "mlx"] if round_id % 2 == 0 else ["mlx", "cpp"]):
            model_path = args.cpp_model if engine == "cpp" else args.mlx_model
            port = None
            if args.suite == "speech":
                command = [str(ROOT / "src-tauri/target/release/examples/benchmark_speech"), model_path] if engine == "cpp" else [str(PYTHON), str(ROOT / "benchmarks/runtime/mlx_speech.py"), model_path]
            else:
                with socket.socket() as sock:
                    sock.bind(("127.0.0.1", 0))
                    port = sock.getsockname()[1]
                command = ([str(ROOT / "src-tauri/binaries/llama-server-aarch64-apple-darwin"),
                            "--model", model_path, "--alias", "qwen3-1.7b", "--host", "127.0.0.1", "--port", str(port),
                            "--n-gpu-layers", "999", "--ctx-size", "4096", "--parallel", "1", "--reasoning", "off",
                            "--no-webui", "--offline", "--cors-origins", "localhost"] if engine == "cpp" else
                           [str(PYTHON), "-m", "mlx_lm", "server", "--model", model_path, "--host", "127.0.0.1", "--port", str(port),
                            "--chat-template-args", '{"enable_thinking":false}', "--decode-concurrency", "1", "--prompt-concurrency", "1",
                            "--prompt-cache-size", "1", "--log-level", "WARNING"])
            result = dict(engine=engine, round=round_id, command=command, samples=[])
            with Child(command, SCRATCH / f"{args.suite}-{engine}-{round_id}.log") as child:
                if args.suite == "speech":
                    speech(args, engine, round_id, child, result)
                else:
                    polish(args, engine, round_id, child, result, port)
                result["peak_rss_bytes_sampled_250ms"] = child.peak_rss
            report["runs"].append(result)
            # Preserve completed runs if a later engine fails.
            Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("suite", choices=["prepare", "speech", "text"])
    parser.add_argument("--cpp-model")
    parser.add_argument("--mlx-model")
    parser.add_argument("--rounds", type=int, default=3)
    parser.add_argument("--samples", type=int, default=5)
    parser.add_argument("--output")
    args = parser.parse_args()
    if args.suite == "prepare":
        prepare()
    else:
        if not args.cpp_model or not args.mlx_model or not args.output or min(args.rounds, args.samples) < 1:
            parser.error("provide both model paths, --output, and positive rounds/samples")
        run(args)
