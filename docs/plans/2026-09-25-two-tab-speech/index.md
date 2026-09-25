# Speech setup, final design

Speech recognition runs either **Built-in** (whisper.cpp inside Typelite) or through **your
server or API key** (any OpenAI-compatible speech service). Onboarding shows one main button and
one link; Settings shows the same pieces. The visual reference is [mock.html](mock.html), agreed
with the user after several iterations.

Status: agreed — 2026-09-25

Replaces the three-type picker from [concise-speech-setup](../2026-09-25-concise-speech-setup/index.md).

## Key decisions

| Decision | Reason |
|---|---|
| Two engines: Built-in, or your server or API key | Local servers and cloud APIs use the same API; they are one kind of setup. |
| Built-in offers only the models this Mac runs well: Best accuracy (large-v3-turbo, 574 MB) and Faster (small, 190 MB), detected from chip, memory and free disk | No choice the Mac cannot handle; with one model there is nothing to choose, but it still shows as selected. |
| The Built-in card has a fixed height; every state uses the same two slots (a status badge line, one action button) | Text stays at the same level in every state. |
| No green checkmark: "Ready", "Downloading 42%", "Download failed" are pill badges (accent, neutral, red tint) | Matches the app's tags; the user disliked the checkmark. |
| Your server or API key: one form (Address, Model, API key optional, Name auto-filled) with the OpenAI example as placeholders and a "Learn more" link to `docs/guides/speech-services.md` | Guides live on GitHub, not in the app; no per-service chips or menus. |
| With no saved presets the sheet opens straight on the form | Nothing to pick from yet. |
| Settings sections become toolbar tabs (icon + label); "Speech recognition uses" is a choice between two option cards, not tabs | Navigation and a setting no longer look the same. |

## Parts

| File | Covers |
|---|---|
| [layout.md](layout.md) | Every screen and state in words. |
| [mock.html](mock.html) | Interactive reference (open in a browser). |

## Open questions

- None.
