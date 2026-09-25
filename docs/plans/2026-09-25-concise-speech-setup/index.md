# Concise speech setup

The speech recognition screens (onboarding step and Settings → Speech) fit without scrolling:
the user picks how they want speech recognition to run, and only the fields for that choice
appear.

Status: agreed — 2026-09-25

Refines the preset editor from [setup-without-dead-ends](../2026-09-25-setup-without-dead-ends/index.md) and sits with the
quick setup from [quick-speech-setup](../2026-09-25-quick-speech-setup/index.md).

## Key decisions

| Decision | Reason |
|---|---|
| First choose a **type**: Built-in (this Mac) · Local server · OpenAI-compatible (bring your own key) | One decision up front; the rest follows from it. |
| OpenAI and Groq are services inside "OpenAI-compatible", not separate entries | Both speak the same API; a small "Service" picker fills the URL and model. |
| Fields per type: Built-in = model; Local server = address + model; OpenAI-compatible = service, API key, model (address shown only for "Custom") | No API key for local setups; no address for known services. |
| Preset name only appears for **Add new preset** | Naming only matters for a custom preset. |
| Language is hidden in onboarding (auto-detect); it stays in Settings → Speech | Auto-detect is right for almost everyone during setup. |
| The setup guide is one link, "How to set this up", opening the guide card as a sheet | Keeps the screen short; the steps are one click away. |
| Test stays as one button with its result on the same line | The one action every type needs. |

## Parts

| File | Covers |
|---|---|
| [layout.md](layout.md) | Fields per type, presets, Settings differences. |

## Open questions

- None.
