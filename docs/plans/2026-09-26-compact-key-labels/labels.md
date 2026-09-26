# Labels

The label of every key name, and the places that draw key caps. Back to [index.md](index.md).

## Label table

`keyParts(name)` in `src/lib/keyLabels.ts` returns the symbol, the optional side and the full
name. The compact text is the symbol followed by the side letter.

| Key name | Cap | Compact text | Full name |
|---|---|---|---|
| `Ctrl` | ⌃ | ⌃ | Control |
| `LeftControl` / `RightControl` | ⌃ with small L / R | ⌃L / ⌃R | Left Control / Right Control |
| `Option`, `Alt` | ⌥ | ⌥ | Option |
| `LeftOption` / `RightOption` | ⌥ with small L / R | ⌥L / ⌥R | Left Option / Right Option |
| `RightAlt` | ⌥ with small R | ⌥R | Right Alt |
| `Shift` | ⇧ | ⇧ | Shift |
| `LeftShift` / `RightShift` | ⇧ with small L / R | ⇧L / ⇧R | Left Shift / Right Shift |
| `Command`, `Super` | ⌘ | ⌘ | Command |
| `LeftCommand` / `RightCommand` | ⌘ with small L / R | ⌘L / ⌘R | Left Command / Right Command |
| `Enter` | ↩ | ↩ | Return |
| `Backspace` | ⌫ | ⌫ | Delete |
| `Delete` | ⌦ | ⌦ | Forward Delete |
| `Tab` | ⇥ | ⇥ | Tab |
| `Escape` | esc | esc | Escape |
| `Left` / `Right` / `Up` / `Down` | ← → ↑ ↓ | ← → ↑ ↓ | Left Arrow / Right Arrow / Up Arrow / Down Arrow |
| `PageUp` / `PageDown` | Page Up / Page Down | same | same |
| `Fn`, `End`, `Home`, `Space`, `F1`–`F20`, letters, digits, punctuation | unchanged | same | same |

A binding's keys keep their display order (special keys and modifiers first, the typing key
last), from `bindingKeyNames`.

## Where caps are drawn

All through `KeyCap` / `KeyCaps` (`src/components/ui/KeyCap.tsx`):

- Home: the shortcut tiles and the extra shortcut rows.
- Settings → General: each shortcut field when idle, the Switch language field, the fixed
  Escape row.
- Onboarding: the large caps on each shortcut's setup page, the inline caps in hints and
  exercise instructions, the Translate legend and the Translate pill preview caption.
- The pill's typing nudge ("Press End to say it instead").
- The Ask panel's "esc to close" hint.

While a shortcut is being recorded, the field shows the held keys as compact text
(`displayHotkey`).
