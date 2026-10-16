# Listening

How the always-on listener captures audio and keeps the cost low. Part of
[hands-free-mode](index.md).

## Flow

```text
mic ─16 kHz mono─> ring (3 s, memory) ─20 ms frames─> voice gate ─voiced segment─> wake check
                                                      (own, Rust)                  (wake-check.md)
```

- **Capture.** The existing `AudioCaptureHandle` (cpal / CoreAudio) at 16 kHz mono, opened on the
  microphone chosen in Settings (or the system default). Output muting is off for the
  listener. One thread (`hands-free`) reads the chunks. The code is in `hands_free/runtime.rs`.
- **Ring buffer** (`hands_free/ring.rs`). Holds the last 3 s of samples, addressed by absolute
  sample position, so the gate can hand the wake check "from where speech began". It is never
  written to disk or logged, and it is cleared on pause.
- **Voice gate** (`hands_free/gate.rs`). This is a streaming form of the voice check in
  `stt/silence.rs`, with the same numbers. A 20 ms frame is voiced when it is above −45 dBFS and
  12 dB above the tracked noise floor. The floor follows quieter frames down at once and rises
  slowly: 5 dB/s, and half that while voiced. So a fan stops counting as speech after a few
  seconds. Speech starts after 3 voiced frames in the last 5, so a key click (1–2 frames) never
  starts it. Speech ends after a hangover of unvoiced frames: 300 ms for wake segments, 900 ms
  for requests. During silence this is a few additions per frame (measured: 0.004% of one core).

## Coexisting with other runs

The listener pauses while the pipeline is not idle, or while Ask is starting, recording or
thinking. This covers the Dictate, Translate and Ask shortcuts, the tray and the CLI. While
paused, the stream stays open and its audio is dropped. When the runs are idle again, the
segmenter starts empty, so audio from before the pause is never checked. CoreAudio lets the
listener and a recording read the same device at once.

## Turning off and quitting

Turning the switch off (in Settings or the tray) stops the stream through the capture handle.
That closes the CoreAudio stream explicitly (see the lesson in `audio/capture.rs`). The listener
then joins its thread, so the wake model is freed. `RunEvent::Exit` does the same before
built-in speech unloads, because GGML's Metal cleanup aborts while a model is loaded. A change
of microphone, wake name, sensitivity or recording limit restarts the listener.

## macOS microphone indicator

While Hands-free mode is on, the stream is open, so macOS shows the orange microphone
indicator all the time. The Settings help text says so. This is the honest signal that the mic is
open, and it cannot be avoided by an app that listens.
