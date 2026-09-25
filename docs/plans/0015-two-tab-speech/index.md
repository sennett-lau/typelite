# 0015 — Two-tab speech setup

Speech recognition has two ways to run: **Built-in** (whisper.cpp inside Typelite) and
**Presets** (any OpenAI-compatible server or API key). Onboarding shows one main button and one
link; everything else lives in Settings.

Status: agreed — 2026-09-25

Replaces the three-type picker from [0014](../0014-concise-speech-setup/index.md).

## Key decisions

| Decision | Reason |
|---|---|
| Two tabs: **Built-in** and **Presets** | A local whisper.cpp server and a cloud API are both OpenAI-compatible; they are the same kind of setup. |
| Built-in offers one model, `large-v3-turbo` (574 MB), shown as text with no dropdown | One choice needs no selector, and one size avoids confusion. |
| The smaller 190 MB model is not offered in onboarding or Home; Settings → Speech keeps it as a small "Use a smaller model (190 MB)" link | Keeps setup to one clear option while leaving an escape for slow Macs or small disks. |
| Onboarding Speech step = the Built-in card (one **Set up** button) + one link "Use your own server or API key…" | Minimum on screen; bring-your-own stays one click away. |
| That link opens a compact sheet: pick a saved preset, or **Add preset** with quick-fill chips (whisper.cpp server on this Mac, OpenAI, Groq) and four fields (name, address, model, API key — key marked optional) | All custom setups use one form. |
| Settings → Speech: the same two tabs; Presets shows the saved-preset picker in the group header (upper right, as today) and the selected preset's fields | Same model as onboarding, with room to edit. |
| Language and recording length stay in Settings only | Unchanged from 0014. |

## Parts

| File | Covers |
|---|---|
| [layout.md](layout.md) | Screens in detail. |

## Open questions

- None.
