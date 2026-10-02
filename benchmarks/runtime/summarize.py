"""Validate complete runtime reports and print warm latency/TTFT summaries."""

import json
import statistics
import sys
from pathlib import Path


def percentile(values, fraction):
    values = sorted(values)
    position = (len(values) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(values) - 1)
    return values[lower] + (values[upper] - values[lower]) * (position - lower)


for name in sys.argv[1:]:
    report = json.loads(Path(name).read_text())
    assert report.get("finished_at"), f"Incomplete report: {name}"
    expected_workloads = (
        {"en", "yue", "mixed", "silence"}
        if report["suite"] == "speech"
        else {"short", "long", "short-cache-miss"}
    )
    assert len(report["runs"]) == report["rounds"] * 2
    print(f"\n{name}")
    print(
        "| Workload | Metric | CPP median [p10, p90] ms | MLX median [p10, p90] ms | Change |"
    )
    print("|---|---|---:|---:|---:|")
    for engine in ["cpp", "mlx"]:
        runs = [r for r in report["runs"] if r["engine"] == engine]
        assert {r["round"] for r in runs} == set(range(report["rounds"]))
        for run in runs:
            assert {s["workload"] for s in run["samples"]} == expected_workloads
            assert len(run["samples"]) == len(expected_workloads) * (
                report["warm_samples"] + 1
            )
            for workload in expected_workloads:
                samples = [s for s in run["samples"] if s["workload"] == workload]
                assert [s["sample"] for s in samples] == list(
                    range(report["warm_samples"] + 1)
                )
                assert [s["phase"] for s in samples] == ["first"] + ["warm"] * report[
                    "warm_samples"
                ]
                assert all(s["elapsed_ms"] > 0 for s in samples)
                if report["suite"] == "text":
                    assert all(
                        s["finish_reason"] == "stop" and not s["reasoning"]
                        for s in samples
                    )
                    assert all(s["text"].strip() and s["ttft_ms"] > 0 for s in samples)
    for workload in sorted(expected_workloads):
        for metric in (
            ["elapsed_ms", "ttft_ms"] if report["suite"] == "text" else ["elapsed_ms"]
        ):
            stats = []
            for engine in ["cpp", "mlx"]:
                groups = [
                    [
                        s[metric]
                        for s in r["samples"]
                        if s["workload"] == workload and s["phase"] == "warm"
                    ]
                    for r in report["runs"]
                    if r["engine"] == engine
                ]
                pooled = sum(groups, [])
                stats.append(
                    (
                        statistics.median(map(statistics.median, groups)),
                        percentile(pooled, 0.1),
                        percentile(pooled, 0.9),
                    )
                )
            cells = [f"{a:.1f} [{b:.1f}, {c:.1f}]" for a, b, c in stats]
            change = (stats[1][0] / stats[0][0] - 1) * 100
            print(
                f"| {workload} | {metric} | {cells[0]} | {cells[1]} | {change:+.1f}% |"
            )
    for engine in ["cpp", "mlx"]:
        runs = [r for r in report["runs"] if r["engine"] == engine]
        print(
            engine,
            "ready ms",
            [round(r["ready_ms"]) for r in runs],
            "peak RSS MB",
            [round(r["peak_rss_bytes_sampled_250ms"] / 1e6) for r in runs],
        )
