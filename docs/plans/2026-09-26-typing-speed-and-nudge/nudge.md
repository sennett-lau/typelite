# Typing nudge

When the typing nudge appears and how it behaves. Back to [index](index.md).

## When

The tracker that counts keystrokes also follows the current typing stretch: keystrokes whose
pauses stay under 5 s. When a stretch reaches about 60 s, the nudge may show if all of these
hold:

- "Measure typing speed" is on and "Don't show again" was never chosen;
- it has not shown today (local calendar day);
- onboarding is finished (the shortcut gate allows every role, plan
  [onboarding-shortcut-gate](../2026-09-26-onboarding-shortcut-gate/index.md));
- no run is active and the Copy pill is not up;
- Typelite's own window does not have focus (the user types in another app).

The check runs on a background thread, never on the key listener thread. A stretch that was
refused (for example during a run) starts over, so the next chance comes after another minute.

## Look

A pill state in the capsule window, so it sits where the pill appears (the screen with the
cursor, bottom centre) and never takes focus. One line on the pill's dark glass with a soft
aurora tint: a microphone icon, "Typing a lot? Press **End** to say it instead." (the user's
own Dictate key), "Don't show again" and ✕. It hides by itself after 8 s; hovering pauses the
countdown. Reduced motion: it fades only.

## Dismissing

- ✕ or the timeout hides it; it may show again on another day.
- "Don't show again" hides it and it never shows again (kept in `speed-stats.json`).
- Any run that starts closes it.
- Turning "Measure typing speed" off also stops the nudge.
