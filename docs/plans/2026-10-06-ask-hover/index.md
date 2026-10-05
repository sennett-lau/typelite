# Hover and pointer cursor in the Ask panel

The Ask panel's sources, citations and buttons had hover styles and `cursor: pointer` in CSS,
but neither showed. The Ask window is never the key window and Typelite stays in the background
(so the user's app keeps focus), and WebKit sends a page in that state no mouse moves. The app
now feeds the cursor position to the page, which applies hover itself, and sets the hand cursor
natively.

Status: building (2026-10-06)

## Goals

- Hover highlights and the hand cursor over every clickable part of the Ask panel: source
  cards and their buttons, the sources summary, `[n]` citations (which also highlight their
  card), close, Insert, Copy and the other buttons.
- No change to focus: the panel still never takes focus from the user's app.

## Non-goals

- The pill, which has no hover states.

## Key decisions

- **Position from the existing click-through tracker.** It already reads the cursor every 30 ms
  while the panel is open; it now also sends `ask:pointer` (window points, or `null` on leaving)
  when the position changes.
- **`.is-hover` mirrors `:hover`.** `src/components/AskPanel/pointerHover.ts` marks the element
  under the cursor and its ancestors, as `:hover` would, and sends `mouseover`/`mouseout` so
  React's enter/leave handlers run. The Ask CSS rules list `.is-hover` next to `:hover`, and
  Tailwind's `hover:` variant matches it.
- **Native cursor.** The page asks for the hand when the element's CSS cursor is `pointer`
  (`set_ask_cursor`), and AppKit sets it. A background app's cursor changes are ignored unless
  the window server's connection property `SetsCursorInBackground` is set; it is private API,
  widely used by utilities, set once, and harmless if refused (the cursor stays an arrow).
- **Not making the panel key.** That would take keyboard focus from the user's app, which Insert
  and dictation rely on.

## Parts

| File | Covers |
| --- | --- |
| `index.md` | The whole change; it is small enough for one file. |

## Open questions

- None.
