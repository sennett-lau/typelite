//! Voice-check CPU and allocation costs. Fixture creation and equivalence checks are untimed.
use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;
use std::hint::black_box;
use std::time::Instant;

use serde_json::{json, Value};
use typelite_lib::stt::silence::VoiceActivity;

use super::{SAMPLES, WARMUPS};

// Frozen with the reference algorithm from 95bd25a: production threshold changes must
// fail this oracle rather than silently changing the before/after workload's behavior.
const WINDOW_MS: u32 = 20;
const EDGE_IGNORE_MS: u32 = 80;
const ABSOLUTE_FLOOR_DB: f64 = -45.0;
const ABOVE_NOISE_DB: f64 = 12.0;
const NOISE_PERCENTILE: f64 = 0.10;

// Track only an explicit, untimed call on this thread. Timing samples still use System;
// the wrapper's disabled TLS check is identical in the before and after executables.
#[derive(Clone, Copy, Default)]
struct AllocationStats {
    calls: usize,
    requested_bytes: usize,
    live_bytes: usize,
    peak_live_bytes: usize,
}

thread_local! {
    static ALLOCATIONS: Cell<Option<AllocationStats>> = const { Cell::new(None) };
}

struct CountingAllocator;

fn record_allocation(allocated: usize, freed: usize, new_allocation: bool) {
    let _ = ALLOCATIONS.try_with(|slot| {
        if let Some(mut stats) = slot.get() {
            stats.calls += usize::from(new_allocation);
            stats.requested_bytes += allocated;
            stats.live_bytes = stats.live_bytes - freed + allocated;
            stats.peak_live_bytes = stats.peak_live_bytes.max(stats.live_bytes);
            slot.set(Some(stats));
        }
    });
}

unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let pointer = unsafe { System.alloc(layout) };
        if !pointer.is_null() {
            record_allocation(layout.size(), 0, true);
        }
        pointer
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        let pointer = unsafe { System.alloc_zeroed(layout) };
        if !pointer.is_null() {
            record_allocation(layout.size(), 0, true);
        }
        pointer
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        record_allocation(0, layout.size(), false);
        unsafe { System.dealloc(pointer, layout) };
    }

    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        let new_pointer = unsafe { System.realloc(pointer, layout, new_size) };
        if !new_pointer.is_null() {
            record_allocation(new_size, layout.size(), true);
        }
        new_pointer
    }
}

#[global_allocator]
static ALLOCATOR: CountingAllocator = CountingAllocator;

/// Frozen reference from test-cleanup revision 95bd25a. Kept only in the benchmark to
/// compare all measured fields, not just speech/no-speech, before recording a sample.
fn reference_measure(pcm: &[u8], sample_rate: u32) -> VoiceActivity {
    let rate = sample_rate.max(1) as usize;
    let samples: Vec<f64> = pcm
        .chunks_exact(2)
        .map(|b| f64::from(i16::from_le_bytes([b[0], b[1]])) / 32768.0)
        .collect();
    let duration_ms = (samples.len() * 1000 / rate) as u32;
    let window = (rate * WINDOW_MS as usize / 1000).max(1);
    let edge = rate * EDGE_IGNORE_MS as usize / 1000;
    let inner = if samples.len() > 2 * edge {
        &samples[edge..samples.len() - edge]
    } else {
        &[][..]
    };
    let mut levels: Vec<f64> = inner
        .chunks_exact(window)
        .map(|window| {
            let rms = (window.iter().map(|s| s * s).sum::<f64>() / window.len() as f64).sqrt();
            if rms <= 0.0 {
                -100.0
            } else {
                (20.0 * rms.log10()).max(-100.0)
            }
        })
        .collect();
    if levels.is_empty() {
        return VoiceActivity {
            duration_ms,
            peak_db: -100.0,
            noise_floor_db: -100.0,
            voiced_ms: 0,
        };
    }
    let peak_db = levels.iter().copied().fold(-100.0, f64::max);
    let original = levels.clone();
    levels.sort_by(f64::total_cmp);
    let index = ((levels.len() as f64 * NOISE_PERCENTILE) as usize).min(levels.len() - 1);
    let noise_floor_db = levels[index];
    let threshold = ABSOLUTE_FLOOR_DB.max(noise_floor_db + ABOVE_NOISE_DB);
    VoiceActivity {
        duration_ms,
        peak_db,
        noise_floor_db,
        voiced_ms: original.iter().filter(|&&db| db >= threshold).count() as u32 * WINDOW_MS,
    }
}

/// Alternating 700 ms higher-energy windows and 300 ms room noise. This is deterministic
/// amplitude-modulated noise, not recorded speech or an inference/accuracy benchmark.
fn fixture(seconds: usize, voice_amplitude: i32) -> Vec<u8> {
    let mut state: u32 = 0x1234_5678;
    let mut pcm = Vec::with_capacity(seconds * 16_000 * 2);
    for sample in 0..seconds * 16_000 {
        state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        let amplitude = if sample % 16_000 < 11_200 {
            voice_amplitude
        } else {
            16
        };
        let value = ((state >> 16) as i32 - 32_768) * amplitude / 32_768;
        pcm.extend_from_slice(&(value as i16).to_le_bytes());
    }
    pcm
}

fn check_equivalence() {
    for rate in [0_u32, 1, 8_000, 16_000, 44_100, 48_000] {
        let effective = rate.max(1) as usize;
        let edge = effective * EDGE_IGNORE_MS as usize / 1000;
        let window = (effective * WINDOW_MS as usize / 1000).max(1);
        for samples in [
            0,
            1,
            2 * edge,
            2 * edge + window - 1,
            2 * edge + window,
            effective,
        ] {
            let pcm: Vec<u8> = (0..samples)
                .flat_map(|index| {
                    [i16::MIN, i16::MAX, 0, -1, 1, -184, 184, -185, 185][index % 9].to_le_bytes()
                })
                .collect();
            assert_eq!(
                VoiceActivity::measure(&pcm, rate),
                reference_measure(&pcm, rate)
            );
            let mut odd = pcm;
            odd.push(0xff);
            assert_eq!(
                VoiceActivity::measure(&odd, rate),
                reference_measure(&odd, rate)
            );
        }
    }

    // Isolated loud clicks must not become speech; ignored edge clicks must not raise the
    // measured peak. Keep complete/partial windows and the 200 ms decision boundary covered.
    for (start, voiced_samples, has_speech) in [
        (0, 320, false),
        (16_000 - 320, 320, false),
        (3_200, 320, false),
        (3_200, 9 * 320, false),
        (3_200, 10 * 320, true),
    ] {
        let mut pcm = vec![0; 16_000 * 2];
        for sample in start..start + voiced_samples {
            pcm[sample * 2..sample * 2 + 2].copy_from_slice(&i16::MAX.to_le_bytes());
        }
        let actual = VoiceActivity::measure(&pcm, 16_000);
        assert_eq!(actual, reference_measure(&pcm, 16_000));
        assert_eq!(actual.has_speech(), has_speech);
    }

    // Constant windows isolate both level thresholds. PCM magnitudes 184/185 straddle
    // -45 dBFS; 254/255 straddle 12 dB above a 64-magnitude background. Check both sides
    // with 180 ms and 200 ms of qualifying windows so the duration gate cannot mask a
    // changed level comparison. Silence/background windows fix the 10th-percentile floor.
    for (background, amplitude, above_threshold) in [
        (0_i16, 184_i16, false),
        (0, 185, true),
        (64, 254, false),
        (64, 255, true),
    ] {
        for windows in [9, 10] {
            let mut pcm = background.to_le_bytes().repeat(16_000);
            for sample in 3_200..3_200 + windows * 320 {
                pcm[sample * 2..sample * 2 + 2].copy_from_slice(&amplitude.to_le_bytes());
            }
            let actual = VoiceActivity::measure(&pcm, 16_000);
            assert_eq!(actual, reference_measure(&pcm, 16_000));
            assert_eq!(
                actual.voiced_ms,
                if above_threshold {
                    windows as u32 * 20
                } else {
                    0
                }
            );
            assert_eq!(actual.has_speech(), above_threshold && windows == 10);
        }
    }
}

fn benchmark(
    id: &str,
    pcm: &[u8],
    iterations: usize,
    expected_speech: bool,
    description: &str,
) -> Value {
    let expected = reference_measure(pcm, 16_000);
    assert_eq!(expected.has_speech(), expected_speech, "{id}");
    assert_eq!(VoiceActivity::measure(pcm, 16_000), expected, "{id}");

    ALLOCATIONS.with(|slot| slot.set(Some(AllocationStats::default())));
    let measured = black_box(VoiceActivity::measure(black_box(pcm), 16_000));
    let allocations = ALLOCATIONS.with(|slot| slot.replace(None).unwrap());
    assert_eq!(measured, expected);
    assert_eq!(
        allocations.live_bytes, 0,
        "voice check retained an allocation"
    );

    let mut samples = Vec::with_capacity(SAMPLES);
    for sample in 0..WARMUPS + SAMPLES {
        let start = Instant::now();
        for _ in 0..iterations {
            black_box(VoiceActivity::measure(black_box(pcm), 16_000));
        }
        if sample >= WARMUPS {
            samples.push(start.elapsed().as_secs_f64() * 1e6 / iterations as f64);
        }
    }
    json!({
        "id": id, "unit": "us/op", "samples_us": samples,
        "workload": {
            "pcm_bytes": pcm.len(), "sample_rate": 16_000,
            "fixture": description,
            "iterations_per_sample": iterations, "warmups": WARMUPS, "samples": SAMPLES
        },
        "voice_activity": {
            "duration_ms": measured.duration_ms, "peak_db": measured.peak_db,
            "noise_floor_db": measured.noise_floor_db, "voiced_ms": measured.voiced_ms,
            "has_speech": measured.has_speech()
        },
        "allocations_per_operation": {
            "calls_including_realloc": allocations.calls,
            "requested_bytes_including_realloc": allocations.requested_bytes,
            "peak_live_requested_bytes": allocations.peak_live_bytes
        }
    })
}

pub(super) fn benchmarks() -> Vec<Value> {
    check_equivalence();
    const SPEECH: &str = "LCG noise; 700ms amplitude 4096 / 300ms amplitude 16 per second";
    vec![
        benchmark("voice/speech-4s", &fixture(4, 4_096), 250, true, SPEECH),
        benchmark("voice/speech-60s", &fixture(60, 4_096), 16, true, SPEECH),
        benchmark("voice/speech-600s", &fixture(600, 4_096), 1, true, SPEECH),
        benchmark(
            "voice/quiet-4s",
            &fixture(4, 384),
            250,
            true,
            "LCG noise; 700ms amplitude 384 / 300ms amplitude 16 per second",
        ),
        benchmark(
            "voice/silence-4s",
            &[0; 4 * 16_000 * 2],
            250,
            false,
            "digital silence",
        ),
    ]
}
