//! Times the paste path's "is the target app still in front?" check (plan `native-target-check`).
//! Prints one JSON line: the guard it checks against and every sample in milliseconds.
//!
//!     cargo run --release --example benchmark_target_check -- [samples]
use std::time::Instant;

use serde_json::json;
use typelite_lib::app_detector::cache::TargetCheckBenchmark;

fn main() {
    let samples: usize = std::env::args()
        .nth(1)
        .and_then(|value| value.parse().ok())
        .unwrap_or(20);
    let bench = TargetCheckBenchmark::new();
    // One warm-up call.
    let first = Instant::now();
    let matched_first = bench.check();
    let first_ms = first.elapsed().as_secs_f64() * 1000.0;
    let mut times = Vec::with_capacity(samples);
    let mut matched = 0;
    for _ in 0..samples {
        let start = Instant::now();
        if bench.check() {
            matched += 1;
        }
        times.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    let (pid, identity) = bench.guard();
    println!(
        "{}",
        json!({
            "guard": {"pid": pid, "identity": identity},
            "first_ms": first_ms, "first_matched": matched_first,
            "samples_ms": times, "matched": matched, "samples": samples,
        })
    );
}
