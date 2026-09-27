# Quiet no speech

When a run ends with no speech (the shortcut was pressed again without speaking, or the
hallucination guard dropped the transcript), the pill no longer turns into the red error pill
with "Didn't catch that". It ends with the **calm fade**: no text and no red. The label leaves,
the light that was showing drains to grey under a soft grey flash, the pill narrows to 104 pt,
and it hides about 0.6 s later. Nothing is pasted, as before. The visual reference is
[mock.html](mock.html) (option "Calm fade").

Status: done — 2026-09-27

Changes no decision of an earlier plan. The red notice it replaces (1.5 s, 224 pt) was added
without a plan, together with the rule that nothing is pasted when no speech is heard. The pill
state tables of [aurora-pill](../2026-09-25-aurora-pill/index.md) and
[translate-pill-and-keys](../2026-09-26-translate-pill-and-keys/index.md) list only a general
error state, and that still holds for real errors.

## Goals

- A run with no speech ends calmly: no words, no red, nothing to read.
- The same look in Dictate, Translate and Ask, whether the run is stopped with the shortcut or
  by clicking the pill.
- Nothing else changes: detection, what is pasted, real errors, Esc.

## Non-goals

- Changing how no speech is detected (the voice check in `stt/silence.rs`, the hallucination
  guard) or the events the backend sends.
- Changing the red error pill for real errors, or Esc, which hides the pill at once.
- The onboarding exercises' own "Didn't catch that." hint.

## Key decisions

| Decision | Reason |
|---|---|
| Hearing no speech is not an error: the pill shows no text, no icon and no red | The user pressed the key without speaking, so there is nothing to report; the red pill did not fit the UI and was its only red. |
| The label leaves with the normal content exit (0.14 s fade and 3 pt blur) | The same exit as every other change of state. |
| The light that was showing (the sweep, or the glow after a recording) stops where it is, turns grey (saturation 0, brightness 1.35) over 0.3 s and fades to a faint trace over 0.42 s | Shows that the work stopped, without a message. |
| A soft grey flash (a white radial glow up to 0.3 opacity, gone within 0.56 s) plays at the same time | The calm twin of the teal done flash. |
| The pill narrows to 104 × 32 pt with the existing 0.28 s size animation | A slightly smaller, empty pill reads as winding down. |
| It hides with the normal hide 620 ms after the result, and is gone about 0.84 s after it | Short, because there is nothing to read. |
| Frontend only: the backend still sends `pipeline:error` with `stt_no_speech_detected` and goes idle; the capsule turns that code into its `quiet` state instead of the error pill | Detection and events stay as they are; no Rust change. |
| Every other effect stays: nothing is pasted, the AI is not called, the sidebar's speech and AI status are not touched, and the recording's leftovers are cleared at the end, as after an error | Only the look changes. |
| A live run always wins over the calm fade, and a new run clears it at once | As for the done flash and errors. |
| An Ask run goes idle a moment before it reports no speech; the calm fade still narrows from the pill just shown instead of taking its size at once | The same look for every mode. |
| Real errors (speech server offline, AI failed, setup needed, and so on) keep the red error pill; Esc is unchanged | They are information the user needs. |
| Reduced motion: no drain and no flash; the label and the old light fade and the pill hides | Like the other aurora effects. |
| The onboarding exercises keep their "Didn't catch that." line, and the string `capsule.errors.stt_no_speech_detected` stays | The exercises listen to the event directly and must say "Try again"; every error code keeps a message. |

### Considered

- **The red pill as it was, 224 pt with "Didn't catch that" for 1.5 s**: reads as an error for
  something that is not one.

## Parts

| File | Covers |
|---|---|
| [fade.md](fade.md) | The calm fade frame by frame, a new run during it, reduced motion, and where it lives in the code. |
| [mock.html](mock.html) | The approved mockup: the calm fade next to the old red pill, live and frame by frame. |

## Open questions

- Esc could end with the same fade instead of hiding the pill at once. Not changed now.
