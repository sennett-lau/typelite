# 0007 — Setup without dead ends

Nobody should get stuck in setup because they have no speech or AI server yet. Both service
steps can be skipped; each has an in-app guide; the built-in presets become templates anyone can
use; and when a service is missing, Home shows what to finish and the tutorial is offered once
both services work.

Status: agreed — 2026-09-25

## Goals

- Every onboarding step can be left, either by finishing it or by "Skip for now".
- Setting up speech or AI is explained inside the app, with copyable commands.
- The app is honest about what works: missing services disable only the features that need them.

## Non-goals

- Hosting any server or model ourselves.

## Key decisions

| Decision | Reason |
|---|---|
| Speech and AI steps get "Skip for now" | A user without a server must still reach the app. |
| Editable fields and presets on both steps, same as Settings | Users on another computer or a cloud key need their own URL, model and key. |
| AI step title: "AI Polish Service" | Says what it is for. |
| "How to set this up" opens an in-app guide card | Works offline and while the repository is private; the card links to the full guide. |
| Built-in presets are templates for everyone, not the author's machines | A public build must not ship private IPs. The author saves their own presets. |
| whisper.cpp and Ollama are installed from their official sources by a script and links; we host nothing | Always current, checksummed, no bandwidth or licence redistribution for us. |
| If speech or AI is not verified after step 4, the shortcut tutorial is skipped and onboarding finishes | The tutorial needs both; it is offered later instead. |
| Home shows a "Finish setup" card per missing service | Clear next step, one click to the right settings. |
| When both services pass a test for the first time, a dialog offers the shortcut tutorial | Brings the user back to the part they skipped. |

## Parts

| File | Covers |
|---|---|
| [behaviour.md](behaviour.md) | Steps, presets, what is disabled, Home card, tutorial prompt. |
| Guides | `docs/guides/speech-recognition.md`, `docs/guides/ai-polish.md`, `scripts/setup-local-whisper.sh` |

## Open questions

- None.
