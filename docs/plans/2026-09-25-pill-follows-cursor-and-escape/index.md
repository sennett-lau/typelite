# 0016 — Pill follows the cursor's screen, and Escape cancels

Two Typeless behaviours: while the pill is showing, it moves to whichever screen the mouse
pointer is on; and pressing **Escape** cancels the current recording or processing, like the
pill's cancel button.

Status: done — 2026-09-25

## Goals

- On multi-monitor setups the pill is always on the screen the user is looking at.
- Cancel without reaching for the mouse.

## Key decisions

| Decision | Reason |
|---|---|
| While the pill is visible, check the pointer's screen about 4 times a second; when it changes, move the pill to the bottom-centre of the new screen | Matches Typeless; cheap; only runs while the pill is up. |
| The move is a short fade (out on the old screen, in on the new), not a slide across screens | Screens can differ in size and scale; a slide would look broken. |
| Placement uses the same logic as today (logical points, each screen's own scale; never read back and re-write the position) | Keeps the fix for the old drift and crash. |
| Escape cancels while recording, preparing, transcribing, polishing or pasting (Dictate, Translate, Ask), exactly like the cancel button | One consistent "stop" key. |
| Escape is caught by the native key listener only while such a run is active, and swallowed then | Outside a run Escape keeps working normally in every app. |
| After cancel the pill hides without the done flash; nothing is pasted | Cancel means cancel. |
| An open Ask answer panel also closes with Escape (it already may; keep it) | Consistent. |

## Open questions

- None.
