# Shortcut capture

Record a shortcut by pressing the real keys, like Typeless. Back to [index](index.md).

## Today

- The recorder listens to `keydown` in the settings web view. It only understands "hold
  modifiers, then press a normal key", joins the result into text like `Ctrl+Shift+/`, and
  confirms it after 1.5 s.
- A web view cannot see Fn, cannot tell left and right modifiers apart in this code, and treats
  a modifier pressed after a normal key as "still typing". So End + Right Shift cannot be
  recorded; an early version added preset buttons as a workaround.
- The native macOS listener (`native_hotkey.rs`) can handle these keys, but only for a fixed
  list of triggers (Fn, End and their combos).

## Target

- Click a shortcut field → it shows "Press keys…" → the user presses and holds the combination
  → the field shows it live (for example `End + Right Shift`) → releasing all keys saves it.
  `Esc` cancels.
- Capture happens in the **native key listener**, which sends each key event to the settings
  window while recording. That is the only place that sees Fn, End and left/right modifiers.
  Normal shortcuts are paused while recording.
- Any combination the native listener can watch is allowed: a single key (End, Fn, F13…, a
  right-hand modifier) or a base key plus up to two extra keys, in any press order.
- The native listener becomes general. Instead of fixed Fn/End variants, a binding is "a base
  key plus a set of extra keys, each identified by keycode and side". The End work in our branch
  becomes one case of this.
- Conflicts are checked when saving, as today, and shown inline.
- Keys that would break typing on their own (letters, Space, Enter) are only allowed with at
  least one modifier.

## Why

This is the Typeless behaviour, and it replaces the growing list of preset buttons.
