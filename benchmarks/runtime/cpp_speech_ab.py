from __future__ import annotations

"""A/B timing and accuracy for two builds of the built-in speech engine.

Drives two release builds of `examples/benchmark_speech` (before/after) over the fixtures in
`fixtures/manifest.json`, in alternating fresh processes. Each process loads the model, makes
one first call per fixture, then `--warm` timed calls per fixture. Language is auto-detect,
as in the app. Standard library only.

    python3 benchmarks/runtime/cpp_speech_ab.py --before <bin> --after <bin> \
        --model <ggml model> --rounds 3 --out <file.json>
"""

import argparse
import hashlib
import json
import platform
import re
import statistics
import subprocess
import tempfile
import time
import unicodedata
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent


def pcm_file(wav_path: Path, tmp: Path) -> Path:
    with wave.open(str(wav_path)) as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2
        out = tmp / (wav_path.stem + ".pcm")
        out.write_bytes(w.readframes(w.getnframes()))
    return out


def tokens(text: str) -> list[str]:
    """Words for Latin text, characters for Han; punctuation and case ignored."""
    text = unicodedata.normalize("NFKC", text).lower()
    out = []
    for part in re.findall(r"[㐀-鿿]|[a-z0-9']+", text):
        out.append(part)
    return out


def error_rate(reference: str, hypothesis: str) -> float | None:
    ref, hyp = tokens(reference), tokens(hypothesis)
    if not ref:
        return None
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i] + [0] * len(hyp)
        for j, h in enumerate(hyp, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h))
        prev = cur
    return prev[-1] / len(ref)


def run_process(binary: str, model: str, fixtures, pcms, warm: int):
    proc = subprocess.Popen(
        [binary, model], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
        stderr=subprocess.DEVNULL,
    )
    ready = json.loads(proc.stdout.readline())
    result = {"load_ms": ready["load_ms"], "fixtures": {}}

    def call(fixture_id):
        proc.stdin.write(json.dumps({"pcm": str(pcms[fixture_id])}) + "\n")
        proc.stdin.flush()
        return json.loads(proc.stdout.readline())

    for f in fixtures:
        first = call(f["id"])
        samples = [call(f["id"]) for _ in range(warm)]
        result["fixtures"][f["id"]] = {
            "first_ms": first["elapsed_ms"],
            "warm_ms": [s["elapsed_ms"] for s in samples],
            "texts": sorted({s["text"] for s in samples + [first]}),
            "language": first.get("language"),
            "error_rate": error_rate(f["reference"], first["text"]),
        }
    proc.stdin.close()
    proc.wait()
    return result


def pct(values, q):
    values = sorted(values)
    k = (len(values) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(values) - 1)
    return values[lo] + (values[hi] - values[lo]) * (k - lo)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", required=True)
    ap.add_argument("--after", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--rounds", type=int, default=3)
    ap.add_argument("--warm", type=int, default=5)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    fixtures = json.loads((HERE / "fixtures" / "manifest.json").read_text())
    with tempfile.TemporaryDirectory() as tmp:
        pcms = {f["id"]: pcm_file(HERE / "fixtures" / f"{f['id']}.wav", Path(tmp)) for f in fixtures}
        runs = {"before": [], "after": []}
        for r in range(args.rounds):
            order = ["before", "after"] if r % 2 == 0 else ["after", "before"]
            for name in order:
                runs[name].append(run_process(getattr(args, name), args.model, fixtures, pcms, args.warm))
                time.sleep(2)

    summary = {}
    for f in fixtures:
        row = {}
        for name in ("before", "after"):
            per_process = [statistics.median(p["fixtures"][f["id"]]["warm_ms"]) for p in runs[name]]
            pooled = [x for p in runs[name] for x in p["fixtures"][f["id"]]["warm_ms"]]
            rates = [p["fixtures"][f["id"]]["error_rate"] for p in runs[name]]
            row[name] = {
                "median_ms": statistics.median(per_process),
                "p10_ms": pct(pooled, 0.1),
                "p90_ms": pct(pooled, 0.9),
                "first_ms_median": statistics.median(p["fixtures"][f["id"]]["first_ms"] for p in runs[name]),
                "error_rate": rates[0],
                "texts": sorted({t for p in runs[name] for t in p["fixtures"][f["id"]]["texts"]}),
            }
        row["change_pct"] = 100 * (row["after"]["median_ms"] / row["before"]["median_ms"] - 1)
        summary[f["id"]] = row

    sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
    report = {
        "recorded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "machine": {"platform": platform.platform(), "processor": platform.processor()},
        "binaries": {"before": sha(args.before), "after": sha(args.after)},
        "model": {"file": Path(args.model).name, "sha256": sha(args.model)},
        "rounds": args.rounds,
        "warm": args.warm,
        "summary": summary,
        "runs": runs,
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    for fid, row in summary.items():
        b, a = row["before"], row["after"]
        print(
            f"{fid:9} before {b['median_ms']:8.1f} ms  after {a['median_ms']:8.1f} ms  "
            f"{row['change_pct']:+6.1f}%  err {b['error_rate']} -> {a['error_rate']}"
        )


if __name__ == "__main__":
    main()
