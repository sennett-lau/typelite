# Layout

Back to [index](index.md).

## Onboarding → Speech recognition

```
Speech recognition
Turn your voice into text on this Mac.

┌ Built-in (recommended) ──────────────────────────────┐
│ Downloads the Whisper large-v3-turbo model (574 MB)  │
│ and runs it inside Typelite. No other software.      │
│                                         [ Set up ]   │   (progress bar replaces the button)
└──────────────────────────────────────────────────────┘
Use your own server or API key…                  Skip for now
```

- When a model is already installed: the card says "Built-in model ready (574 MB)" with a check,
  and Next is enabled.
- "Use your own server or API key…" opens the Presets sheet. Choosing or adding a preset there,
  then a passing Test, completes the step.

## Presets sheet (onboarding) / Presets tab (Settings)

- If saved presets exist: a picker of them (the built-in templates are not listed as presets any
  more; they become quick-fill chips), plus **Add preset**.
- **Add preset** form:
  - Quick fill: `whisper.cpp server on this Mac` · `OpenAI` · `Groq`. A chip fills address and
    model and a suggested name; nothing is saved until **Save**.
  - Fields: Name, Address, Model, API key (optional, placeholder "Leave empty for local servers").
  - **Test** with its result on the same line, then **Save**.
- Settings shows the selected preset's fields editable in place, with Delete for it.

## Settings → Speech

- Tabs: **Built-in** | **Presets**. The active tab is the type of the active preset.
- Built-in tab: installed model line (name, size, Delete), Quick setup card if none installed,
  and the small link "Use a smaller model (190 MB)".
- Presets tab: as above, with the saved-preset picker in the group header's upper right.
- Below both: Language and Recording length groups.

## Migration

Existing presets keep working. Old built-in server/cloud templates that the user never edited
are dropped from the list (they are now quick-fill chips); edited or user-created presets stay.
