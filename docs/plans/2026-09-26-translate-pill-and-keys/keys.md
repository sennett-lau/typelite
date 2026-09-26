# Keys during a Translate recording

Which keys stop and switch a running Translate recording. Back to [index](index.md).

## Rules

| Press | Effect |
|---|---|
| The Translate shortcut's first key, alone | Stops and pastes the translation |
| The Switch language key | Moves to the next language |
| The whole Translate shortcut, in either key order | Stops and pastes |
| The Dictate shortcut | Stops and pastes (unchanged) |
| Escape | Cancels (unchanged) |

"First key" is the first key of the shortcut as it is stored and shown: modifiers in their
usual order, then the main key. `End + Right Shift` → End; `Fn + Left Shift` → Fn;
`Ctrl + Option + T` → Ctrl (either side, like the shortcut itself).

Examples with the user's bindings (Dictate `End`, Translate `End + Right Shift`, Switch
language `Shift`): End stops; either Shift switches; End + Right Shift in either order stops
and does not switch.

## How the key listener does it

- The registration plan gets extra *stop keys* for every Translate binding (macOS, where the
  native key listener runs): its first key, and, when the Translate shortcut itself is handled
  by the global-shortcut plugin, the whole shortcut too, so the first key waits for its release
  when a larger chord could follow.
- Stop keys are live only while a Translate recording captures audio, exactly like Switch
  language (the same gate). A key already held when the recording started never counts.
- Stop keys may share keys with other shortcuts (End is also Dictate). When a stop key and
  another shortcut have the same keys, the stop key wins while the gate is open. A stop key
  equal to a Switch language key is left out.
- A stop key that is a modifier is not swallowed, so the focused app and any shortcut that
  uses the modifier still see it; End and other standalone keys are swallowed as always.
- The handler stops only a Translate recording; a late event after the recording ended does
  nothing (stopping is idempotent anyway).
