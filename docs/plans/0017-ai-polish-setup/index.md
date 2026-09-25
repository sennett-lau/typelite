# 0017 — AI polish setup, final design

AI polish runs either **Built-in** (llama.cpp's `llama-server`, shipped inside Typelite and
started on this Mac) or through **your server or API key** (any OpenAI-compatible chat
service, such as Ollama on another computer). Onboarding and Settings use the same pieces as the
speech setup from [0015](../0015-two-tab-speech/index.md). The visual reference is
[mock.html](mock.html), agreed with the user.

Status: building — 2026-09-25

## Goals

- One-click local AI polish on Apple Silicon Macs: pick a model, it downloads, is checked and
  tested, done. No Ollama, no terminal.
- The AI step in onboarding and Settings → AI look and behave like the speech ones.
- Settings → AI is regrouped (Polish, Translation, Advanced) without losing any setting.
- Both Settings pages (Speech and AI) have one **Learn more** link at the top, and hide the
  model download section when no built-in model suits this Mac.

## Non-goals

- Settings → General changes (the General screen in the mock is only a proposal).
- Choosing the best model for Cantonese. The two models below are a starting point; changing
  them later means changing the model table only.
- Built-in AI on Intel Macs.

## Key decisions

| Decision | Reason |
|---|---|
| Built-in runs `llama-server` as a separate process on 127.0.0.1, not llama.cpp linked into the app | llama.cpp and whisper.cpp each bundle their own ggml; linking both into one binary risks duplicate symbols. The server speaks the OpenAI API that AI polish already uses. |
| `llama-server` is built from source at a pinned llama.cpp release and shipped inside the app bundle; only model files are downloaded | Programs are signed with the app; a downloaded program would not be. Models are data and are checked against a SHA-256. |
| Models: **Best quality** Qwen3-4B-Instruct-2507 Q4_K_M (~2.5 GB, Apple Silicon with ≥ 16 GB) and **Faster** Qwen3-1.7B Q4_K_M (~1.1 GB, Apple Silicon with ≥ 8 GB) | The 4B is the model already used on the user's PC; the 1.7B fits 8 GB Macs. User: "keep those as two models for now". |
| Thinking is always off for built-in models | Qwen3-1.7B thinks by default; thinking makes polish slow and can return empty content (see CLAUDE.md). |
| Model files use the same download, resume and checksum code as the speech models | One tested path. |
| When no model suits the Mac: no model cards, no status row, no Set up / Download button; the Built-in option shows "Not available on this Mac" and cannot be picked | The user asked for the download section to be hidden, not shown disabled. |
| "Learn more" sits on the "… uses" header of each Settings page | The link is visible whichever option is picked; replaces the scattered links. |

## Parts

| File | Covers |
|---|---|
| [builtin-ai.md](builtin-ai.md) | The llama-server binary, models, lifecycle, config and presets. |
| [screens.md](screens.md) | Onboarding step, Settings → AI, and the Speech page changes. |
| [mock.html](mock.html) | Interactive reference (open in a browser). |

## Open questions

- Model choice for Cantonese quality (another agent is testing Qwen3.5); swap later if needed.
