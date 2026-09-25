# 0003 — Onboarding as a tutorial

First-run setup becomes seven short steps. The first four get the machine ready (permissions,
microphone, speech model, AI model). The last three teach the three shortcuts by having the user
set each one and use it once. Setup is complete when all three shortcuts have worked.

Status: agreed — 2026-09-24

Replaces the six-step onboarding from 0002 (Welcome, Permissions, Speech, AI, Quick test, Done).

## Goals

- No filler screens. Every step either grants something, configures something, or teaches a
  shortcut by using it.
- All permissions are requested on the first screen, each with its own button and live status.
- The user leaves setup having used Dictate, Translate and Ask once each.

## Non-goals

- Choosing the UI language (English by default; changeable in Settings).
- Explaining every setting. Anything not needed for the first dictation stays in Settings.

## Key decisions

| Decision | Reason |
|---|---|
| Permissions live on the welcome screen | The welcome is otherwise empty; granting is the first real action. |
| Microphone gets its own step | Some users have several inputs; the wrong one makes every later test fail. |
| Each shortcut step = record the shortcut, then use it once | Teaching by doing; a step is complete only when the shortcut worked. |
| Translate step picks exactly one target language | Keeps the step simple; the other two slots stay editable in Settings. |
| Speech and AI steps keep their "Test must pass" rule | Later steps depend on both working. |

## Parts

| File | Covers |
|---|---|
| [flow.md](flow.md) | Each step: what it shows, what completes it, what it saves. |

## Open questions

- Whether a user may skip a shortcut tutorial (for example if the PC is off) and finish later.
