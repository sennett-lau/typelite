# 0013 — Guided shortcut tutorial

The three shortcut steps of onboarding become short scripted exercises. The user reads a given
line, sees what they said next to what Typelite produced, and learns the key behaviours: fillers
and self-corrections are cleaned, speech can be translated, highlighted text can be translated,
and Ask answers questions or edits a selection.

Status: done — 2026-09-25

Refines the shortcut steps of [0003](../0003-onboarding-tutorial/index.md). Depends on
[0011](../0011-ask-translate-and-live-questions/index.md) for highlight-and-translate.

## Goals

- Every exercise shows a script to read, the raw transcript, and the final text side by side.
- The user tries each behaviour once, in the order they are most useful.
- Each exercise can be retried, and skipped with "Skip this exercise".

## Key decisions

| Decision | Reason |
|---|---|
| Scripted lines instead of "say anything" | Shows the value of cleanup and corrections immediately. |
| "Before / after" panel for every exercise | The user sees exactly what Typelite changed. |
| Success checks are forgiving (key word present, not exact text) | Speech and models vary; the tutorial must not feel like a test. |
| Scripts shown in the UI language; the user may read them in any language | Works for English and Chinese users. |

## Parts

| File | Covers |
|---|---|
| [exercises.md](exercises.md) | Every exercise: script, expected result, success check. |

## Open questions

- None.
