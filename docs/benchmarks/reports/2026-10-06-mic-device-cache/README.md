# Recording start: remember the chosen microphone

With a microphone chosen in Settings → General, every recording start listed all CoreAudio
devices and read each name to find it again: about 280 ms between the key press and recording,
in which the user's first words were lost. The device found is now remembered, and the next
start only checks that it still has the requested name. Plan `mic-device-cache`.

## Provenance

| Field | Value |
|---|---|
| Report date and time zone | 2026-10-06, UTC+8 |
| Kind | Performance improvement (new isolated workload; separate from `baseline.json`) |
| PR | See the PR that adds this report |
| Previous baseline report | [2026-10-03-dictionary-work](../2026-10-03-dictionary-work/README.md) (unchanged) |
| Base | `291c188` (main) + harness-only commit `03738e0` |
| Candidate | base + harness + this change |
| Harness | `src-tauri/examples/benchmark_mic_resolve.rs`, identical on both; nothing is recorded |
| Hardware, OS and toolchain | Apple M1 Pro, 32 GiB, macOS 26.5.2, rustc 1.98.1, release profile; chosen mic a USB HyperX SoloCast |
| Runs / samples | 3 processes per case (base: 6, alternating), 1 first call + 20 samples (missing mic: 5) |

Raw data: [samples.json](samples.json).

## Change and hypothesis

- **Cost and evidence:** the app log shows "provider ready" → "Using input device" ≈ 200 ms,
  then ≈ 60 ms for the device format and ≈ 45 ms to start the stream. `resolve_input_device`
  calls `host.input_devices()` and reads every device's name whenever a microphone is chosen;
  the system default skips that.
- **Change:** a process-wide `(requested name, device)` memory. With a chosen mic,
  `resolve_input_device` first reads the remembered device's name (one property read) and uses
  it when it matches; otherwise it lists devices as before and remembers what it found.
- **Must stay the same:** an unplugged device fails the name read and a reused device id has a
  different name, so both fall back to listing (unit test
  `remembered_device_is_reused_only_for_the_same_name`); a missing mic still falls back to the
  system default and is searched for again next time, so plugging it back in works; choosing
  another mic changes the requested name.

## Results

Lower is better. Median of process medians, ms per recording start.

| Case | Before | After | Change | Effect |
|---|---:|---:|---:|---|
| Chosen mic, find device | 283 (266–342 per process) | 0.24 (0.21–0.33) | −99.9% (≈ −283 ms) | Confirmed |
| Chosen mic, first start after launch | 372–526 | 377–473 | — | Unchanged: the first start still lists devices |
| System default mic, find device | 0.08 | 0.09 | within noise | Control |
| Chosen mic not connected | — | 290–298 | — | Lists every time, as before, so a re-plugged mic is found |
| Device format (`default_input_config`) | 57–76 | 60–75 | within noise | Control, not changed |

User-facing: with a chosen microphone, recording starts about 0.28 s sooner after the key
press from the second dictation on, so short first words are less likely to be cut.

## Validation and limitations

- `cargo test --lib` (948 passed), `cargo fmt --check`; clippy warnings unchanged (3, all
  pre-existing).
- Measured outside the app (no stream is opened; opening it adds ≈ 45 ms either way). The
  end-to-end start time shows in the app log as the gap between "provider ready" and "Audio
  capture started".
- One machine and one USB microphone.

## Reproduce

```sh
# base + harness commit 03738e0, then this branch
cargo build --manifest-path src-tauri/Cargo.toml --release --example benchmark_mic_resolve
src-tauri/target/release/examples/benchmark_mic_resolve "<microphone name>" 20
src-tauri/target/release/examples/benchmark_mic_resolve "" 20      # system default
```

## Baseline decision

`baseline.json` stays unchanged: this is a new isolated workload, not one of the local overhead
suite's workloads.
