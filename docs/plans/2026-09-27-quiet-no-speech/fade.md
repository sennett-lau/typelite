# The calm fade

What the pill shows after a run with no speech, and where that lives. Back to
[index](index.md).

## Frame by frame

Times are counted from the no-speech result (the values of the mock's `render()`, option
"Calm fade").

| Time | What happens |
|---|---|
| 0–140 ms | The label (usually "Transcribing", sometimes the recording content) fades out with a 3 pt blur. |
| 0–280 ms | The pill narrows from its width (140 pt after "Transcribing", 160 pt after a recording) to 104 pt. |
| 0–300 ms | The light that was showing stops where it is and turns grey: saturation 1 → 0, brightness 1 → 1.35. |
| 0–420 ms | That light fades to 20 %, a faint grey trace that leaves with the pill. |
| 40–80 ms | A soft white radial glow rises to 0.3 opacity… |
| 80–560 ms | …and fades out again: the grey flash. |
| 620 ms | The normal hide: the pill slides down 6 pt, shrinks a little, blurs and fades over 0.22 s. |
| about 840 ms | Gone. The window hides after the hide animation, as always. |

The pill keeps its left edge, as in every other state, so only its right end moves in.

## A new run during the fade

When the pipeline leaves idle (a new Dictate, Translate or Ask run starts), its pill replaces
the calm fade at once, as it replaces the done flash or an error. The drained light and the
flash fade out, still grey; the new run's own light fades in.

## Reduced motion

No drain and no flash. The label and the old light fade, as at any change of state, and the
pill hides at 620 ms with a fade only.

## In the code

- `src/hooks/useTauriEvents.ts`: `pipeline:error` with `stt_no_speech_detected` sets
  `quietFade` in the store instead of `pipelineError`; `preparing`, `recording` and
  `ask_recording` clear it.
- `src/hooks/useCapsuleResize.ts`: the `quiet` capsule state (after an error and the done flash,
  before the Copy pill and the typing nudge, and only while the pipeline is idle), its
  visibility, and `QUIET_PILL_SIZE` (104 × 32).
- `src/components/Capsule/index.tsx`: `QUIET_MS` (620 ms), then the flag clears and the pill
  hides. The light shown before stays the same element and animates to `AURORA_DRAIN`; the
  `quiet` light is the grey flash.
- `src/components/Capsule/CapsuleAurora.tsx` and `.aurora-quiet` / `.aurora-draining` in
  `src/styles/globals.css`: the flash, the paused light, and the reduced-motion rules.
- The onboarding exercises (`useExerciseRun.ts`) listen to the event itself, so they still show
  their own hint.
