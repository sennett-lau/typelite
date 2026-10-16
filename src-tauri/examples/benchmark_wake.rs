//! Plan `hands-free-mode` (measurements.md): measures the hands-free pipeline on synthetic audio.
//!
//! Usage: `cargo run --release --example benchmark_wake -- <wake model> <fixtures dir>
//! [--ctx N] [--no-prompt] [--threads N] [--sensitivity low|normal|high] [--verbose]`
//!
//! The fixtures come from `benchmarks/hands-free/make_fixtures.sh` (macOS `say`). Each clip is
//! played through the real listener logic (voice gate, segmenter, wake check) with one second
//! of room noise before and after it. Prints one JSON object per clip and a summary.
//! `--verbose` adds the wake check's transcript of the synthetic clips (never done in the app).

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde_json::json;
use typelite_lib::hands_free::gate::synth::noise_frame;
use typelite_lib::hands_free::matcher::Sensitivity;
use typelite_lib::hands_free::segment::WakeSegmenter;
use typelite_lib::hands_free::wake::{WakeCheckOptions, WakeChecker};

fn cpu_time() -> Duration {
    let mut usage: libc::rusage = unsafe { std::mem::zeroed() };
    unsafe { libc::getrusage(libc::RUSAGE_SELF, &mut usage) };
    let tv = |t: libc::timeval| Duration::new(t.tv_sec as u64, t.tv_usec as u32 * 1000);
    tv(usage.ru_utime) + tv(usage.ru_stime)
}

fn max_rss_mb() -> f64 {
    let mut usage: libc::rusage = unsafe { std::mem::zeroed() };
    unsafe { libc::getrusage(libc::RUSAGE_SELF, &mut usage) };
    // macOS reports bytes.
    usage.ru_maxrss as f64 / 1_048_576.0
}

fn read_wav(path: &Path) -> Vec<i16> {
    let bytes = std::fs::read(path).expect("read wav");
    let mut i = 12;
    while i + 8 <= bytes.len() {
        let id = &bytes[i..i + 4];
        let len = u32::from_le_bytes(bytes[i + 4..i + 8].try_into().unwrap()) as usize;
        if id == b"data" {
            let data = &bytes[i + 8..(i + 8 + len).min(bytes.len())];
            return data
                .chunks_exact(2)
                .map(|b| i16::from_le_bytes([b[0], b[1]]))
                .collect();
        }
        i += 8 + len + (len & 1);
    }
    panic!("no data chunk in {}", path.display());
}

fn room_noise(ms: usize, seed: &mut u32) -> Vec<i16> {
    (0..ms / 20)
        .flat_map(|_| noise_frame(-65.0, seed))
        .collect()
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let model = PathBuf::from(&args[1]);
    let dir = PathBuf::from(&args[2]);
    let mut options = WakeCheckOptions::default();
    let mut sensitivity = Sensitivity::Normal;
    let mut verbose = false;
    let mut i = 3;
    while i < args.len() {
        match args[i].as_str() {
            "--ctx" => {
                options.audio_ctx = args[i + 1].parse().unwrap();
                i += 1;
            }
            "--threads" => {
                options.threads = args[i + 1].parse().unwrap();
                i += 1;
            }
            "--no-prompt" => options.use_prompt = false,
            "--prompt" => {
                options.prompt_template = args[i + 1].clone();
                i += 1;
            }
            "--verbose" => verbose = true,
            "--sensitivity" => {
                sensitivity = match args[i + 1].as_str() {
                    "low" => Sensitivity::Low,
                    "high" => Sensitivity::High,
                    _ => Sensitivity::Normal,
                };
                i += 1;
            }
            other => panic!("unknown argument {other}"),
        }
        i += 1;
    }

    let rss_before = max_rss_mb();
    let started = Instant::now();
    let mut checker = WakeChecker::load(&model, "Sam", options.clone()).expect("load");
    let load_ms = started.elapsed().as_millis();
    // Warm-up (GPU pipelines, caches).
    checker.check(&vec![0i16; 16_000], sensitivity).unwrap();
    let rss_loaded = max_rss_mb();

    // Idle: 60 s of room noise through the gate; nothing should reach the model.
    let mut seed = 5;
    let idle = room_noise(60_000, &mut seed);
    let mut segmenter = WakeSegmenter::new();
    let cpu0 = cpu_time();
    let wall0 = Instant::now();
    let mut idle_candidates = 0;
    for chunk in idle.chunks(320) {
        idle_candidates += segmenter.feed(chunk).len();
    }
    let idle_cpu = cpu_time() - cpu0;
    println!(
        "{}",
        json!({"idle_seconds": 60, "idle_candidates": idle_candidates,
               "idle_cpu_ms": idle_cpu.as_secs_f64() * 1000.0,
               "idle_cpu_percent_of_realtime": idle_cpu.as_secs_f64() / 60.0 * 100.0,
               "idle_wall_ms": wall0.elapsed().as_secs_f64() * 1000.0})
    );

    let manifest = std::fs::read_to_string(dir.join("manifest.tsv")).expect("manifest");
    let (mut wake_total, mut wake_hit, mut other_total, mut other_hit) = (0, 0, 0, 0);
    let (mut talk_seconds, mut talk_checks, mut talk_wakes, mut talk_cpu) =
        (0.0, 0, 0, Duration::ZERO);
    let mut check_ms: Vec<f64> = Vec::new();
    let mut check_cpu_ms: Vec<f64> = Vec::new();
    for line in manifest.lines() {
        let cols: Vec<&str> = line.split('\t').collect();
        let (label, file, voice, text) = (cols[0], cols[1], cols[2], cols[3]);
        let clip = read_wav(&dir.join(file));
        let mut stream = room_noise(1_000, &mut seed);
        let noise = room_noise(clip.len() / 16 + 20, &mut seed);
        stream.extend(
            clip.iter()
                .zip(noise.iter())
                .map(|(&a, &b)| a.saturating_add(b)),
        );
        stream.extend(room_noise(1_000, &mut seed));

        let mut segmenter = WakeSegmenter::new();
        let mut checks = 0;
        let mut woke = false;
        let mut texts = Vec::new();
        let mut best_score = None;
        let clip_cpu0 = cpu_time();
        for chunk in stream.chunks(320) {
            for candidate in segmenter.feed(chunk) {
                checks += 1;
                let cpu0 = cpu_time();
                let result = checker.check(&candidate.samples, sensitivity).unwrap();
                check_cpu_ms.push((cpu_time() - cpu0).as_secs_f64() * 1000.0);
                check_ms.push(result.elapsed.as_secs_f64() * 1000.0);
                if let Some(m) = result.matched {
                    woke = true;
                    best_score = Some(m.score);
                }
                if verbose {
                    texts.push(result.text);
                }
            }
        }
        let clip_cpu = cpu_time() - clip_cpu0;
        match label {
            "wake" => {
                wake_total += 1;
                wake_hit += usize::from(woke);
            }
            "other" => {
                other_total += 1;
                other_hit += usize::from(woke);
            }
            _ => {
                talk_seconds += clip.len() as f64 / 16_000.0;
                talk_checks += checks;
                talk_wakes += usize::from(woke);
                talk_cpu += clip_cpu;
            }
        }
        println!(
            "{}",
            json!({"label": label, "voice": voice, "text": text, "checks": checks,
                   "woke": woke, "score": best_score, "heard": texts})
        );
    }
    check_ms.sort_by(f64::total_cmp);
    check_cpu_ms.sort_by(f64::total_cmp);
    let pct = |v: &[f64], p: f64| v.get(((v.len() as f64 - 1.0) * p) as usize).copied();
    println!(
        "{}",
        json!({
            "model": model.file_name().map(|n| n.to_string_lossy().to_string()),
            "options": {"audio_ctx": options.audio_ctx, "prompt": options.use_prompt.then_some(&options.prompt_template),
                        "threads": options.threads, "sensitivity": format!("{sensitivity:?}")},
            "load_ms": load_ms,
            "rss_mb_before_load": rss_before, "rss_mb_after_load": rss_loaded,
            "rss_mb_peak": max_rss_mb(),
            "wake_accepted": format!("{wake_hit}/{wake_total}"),
            "false_reject_rate": 1.0 - wake_hit as f64 / wake_total.max(1) as f64,
            "other_false_accepts": format!("{other_hit}/{other_total}"),
            "talk_seconds": talk_seconds, "talk_checks": talk_checks, "talk_false_wakes": talk_wakes,
            "talk_cpu_percent_of_realtime": talk_cpu.as_secs_f64() / talk_seconds.max(1.0) * 100.0,
            "check_ms_p50": pct(&check_ms, 0.5), "check_ms_p90": pct(&check_ms, 0.9),
            "check_ms_max": check_ms.last(),
            "check_cpu_ms_p50": pct(&check_cpu_ms, 0.5),
        })
    );
}
