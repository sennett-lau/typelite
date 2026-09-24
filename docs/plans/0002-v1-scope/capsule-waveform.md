# Capsule waveform

A live voice waveform in the pill while recording, like Typeless. Back to [index](index.md).

## Today

The pieces exist but the result is basic:

- The Rust audio capture measures the input level and emits an `audio:volume` event to the
  capsule (`pipeline.rs`, about every frame of audio).
- `components/Capsule/Waveform.tsx` draws 7 thin bars. Every bar uses the same single volume
  number plus a small sine wobble, so it reads as "something is moving", not as a voice.
- It was likely never seen during testing, because the capsule was being placed off-screen
  (fixed on our branch).

## Target

- Bars that clearly follow the voice: loud syllables make tall bars, silence goes flat within
  about 150 ms.
- The bars show recent history: new levels enter on one side and scroll across, so speech looks
  like a moving waveform instead of every bar pulsing together.
- Levels are smoothed (fast rise, slower fall) and mapped on a log scale, so normal speech fills
  the height and quiet rooms do not look dead.
- Same look in Dictate, Ask and Translate recording, with the mode's colour.
- Respects "reduce motion": static bars at a mid level.
- Cheap to draw: one `requestAnimationFrame` loop, no React re-render per frame (the current
  component already does this).

## Notes

- The level should come from the same audio the app records, so a wrong or muted mic shows up
  immediately. This pairs with [mic-selection.md](mic-selection.md).
- If the event rate from Rust is too low for smooth animation, the Rust side sends a small batch
  of recent levels per event instead of one number.
