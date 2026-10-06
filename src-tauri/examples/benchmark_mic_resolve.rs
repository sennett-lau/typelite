//! Times how long a recording start takes to find the chosen microphone (plan
//! `mic-device-cache`). Each sample runs `resolve_input_device` as `run_capture` does, plus the
//! device's default input config. Prints one JSON line with every sample in milliseconds.
//! Needs no microphone permission: nothing is recorded.
//!
//!     cargo run --release --example benchmark_mic_resolve -- "<device name>" [samples]
use std::time::Instant;

use serde_json::json;
use typelite_lib::audio::resolve_input_device;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    use cpal::traits::DeviceTrait;
    let mut args = std::env::args().skip(1);
    let requested = args.next().filter(|name| !name.is_empty());
    let samples: usize = args.next().and_then(|v| v.parse().ok()).unwrap_or(20);
    let host = cpal::default_host();
    let mut resolve_ms = Vec::with_capacity(samples + 1);
    let mut config_ms = Vec::with_capacity(samples + 1);
    let mut names = Vec::new();
    for _ in 0..=samples {
        let started = Instant::now();
        let resolved = resolve_input_device(&host, requested.as_deref())?;
        resolve_ms.push(started.elapsed().as_secs_f64() * 1000.0);
        let started = Instant::now();
        resolved.device.default_input_config()?;
        config_ms.push(started.elapsed().as_secs_f64() * 1000.0);
        names.push(resolved.name);
    }
    names.dedup();
    println!(
        "{}",
        json!({
            "requested": requested, "resolved": names,
            "first_resolve_ms": resolve_ms[0], "resolve_ms": &resolve_ms[1..],
            "first_config_ms": config_ms[0], "config_ms": &config_ms[1..],
        })
    );
    Ok(())
}
