# Behaviour

Back to [index](index.md).

## Languages

- Default config: `translation.targets = ["en"]`, `active_target = "en"`. Existing configs keep
  their lists, trimmed to three.
- Settings → AI → Translation: the chosen languages as a list (each with a remove button, and a
  "use by default" mark), plus **Add language** while fewer than three are chosen. The last one
  cannot be removed.
- Onboarding Translate step: "Translate into" picks one language, English preselected; it
  becomes the list's first entry and the default.
- The pill shows one chip per chosen language, and no chips when only one is chosen (it shows
  the language name instead).

## Shortcuts

| Action | Default | When it listens |
|---|---|---|
| Start Translate | `Fn + Shift` | Always |
| Switch language | `Shift` (either side) | Only while a Translate recording is running |
| Finish (paste the translation) | Translate shortcut again, or the Dictate shortcut | While a Translate recording is running |

- Switch language moves to the next chosen language and wraps around (1 → 2 → 3 → 1). With one
  language it does nothing.
- While recording, the Switch language key is swallowed so it does not reach the focused app.
- When the Translate shortcut itself contains the Switch key (for example `Fn + Shift` with
  `Shift`), releasing the Translate shortcut does not count as a switch; only a fresh press
  after the recording started does.
- Settings → General → Shortcuts gets a **Switch language** row, recorded by pressing keys.
  Home's shortcut tiles show it under Translate ("Shift to switch language").
- Hold mode: start by holding Translate, switch with the Switch key while still holding,
  release to finish.
