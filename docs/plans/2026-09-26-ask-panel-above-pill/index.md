# Ask: answer panel above the pill

Ask anything's answers, errors and notices move from a window in the middle of the screen into a
frosted-glass panel just above the pill, on the screen the user is working on. The panel never
takes focus from the app the user is typing in, stays until it is closed, and offers Copy and
Insert. While Ask listens with highlighted text, the pill shows which text is included. The
visual reference is [mock.html](mock.html).

Status: building — 2026-09-26

## Goals

- The answer appears where the user is already looking (by the pill), not in the middle of the
  screen.
- Reading an answer never interrupts typing: the frontmost app keeps focus, the panel's buttons
  still work.
- One panel for every Ask outcome: answers, "couldn't replace", live questions and errors.
- The user knows a highlight is part of the question before they finish speaking.

## Non-goals

- Web search (still deferred, see [ask-translate-and-live-questions](../2026-09-25-ask-translate-and-live-questions/index.md)).
- Follow-up questions or a history of answers.
- Dragging or resizing the panel.

## Key decisions

| Decision | Reason |
|---|---|
| The panel sits 10 pt above the pill's frame, centred on it, on the screen that holds the pill's centre | Same place the eye already is; one screen rule for pill and panel. |
| The pill's frame is read from the capsule window (inset by the capsule's 12 pt padding) when the panel opens; without a visible pill the panel uses the cursor's screen | Follows the pill's real size (other plans change its height and widths) without hard-coded heights. |
| Positions are logical points; each screen converts with its own scale factor; the panel is kept 8 pt inside the screen | Mixed-scale monitors (lesson in `CLAUDE.md`); edges never clip it. |
| The panel's position is computed from the stored anchor only, never read back from its own window | Reading back and writing again drifts. |
| The window is a non-activating panel (not focusable, accepts the first click), like the capsule | Typing continues in the frontmost app; buttons work without a focus change. |
| The page reports its height; the window keeps its bottom edge and grows upwards | Transparent parts of a window still catch clicks, so the window fits the panel. |
| Look: dark glass (0.58 alpha) with the aurora tint (accent top-left, violet bottom-right), blur 28 pt and saturation 1.8, 16 pt corners, soft shadow, white text; 420 pt wide; the answer scrolls beyond 190 pt | Matches the pill ([aurora-pill](../2026-09-25-aurora-pill/index.md)); long answers stay compact. |
| Opening: fade, 8 pt rise and scale 0.97 → 1 from the bottom centre (0.26 s); reduced motion fades only | It grows out of the pill. |
| Stays until Escape, ✕, or a new run (Dictate, Translate or Ask) | The user reads at their own pace; a new run starts clean. |
| Escape closes the panel only while it is open, and is swallowed only then | Extends [pill-follows-cursor-and-escape](../2026-09-25-pill-follows-cursor-and-escape/index.md); Escape stays normal otherwise. |
| A run beats the panel for Escape (the panel is already closed by then) | One key, one meaning at a time. |
| Copy and Insert go through the app (clipboard, and ⌘V for Insert), not the web page | The page is never focused, so browser clipboard calls are unreliable. |
| Insert pastes at the cursor; when a highlight was used, the paste replaces it. A successful Insert or retry closes the panel | The user is done with the answer. |
| Edits that replaced the highlight still show no panel; the pill's done flash says "Replaced" | The result is visible in the text itself. |
| While Ask listens with a highlight, the pill shows a chip "About “<first 18 characters>…”" | The user knows the highlight is included; only the start is shown. |

## Parts

| File | Covers |
|---|---|
| [panel.md](panel.md) | Placement maths, panel content per outcome, close rules. |
| [mock.html](mock.html) | Interactive design reference. |

## Open questions

- None.
