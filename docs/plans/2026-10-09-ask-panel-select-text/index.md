# Select and copy text in the Ask panel

Users want to highlight part of an Ask answer and copy only that part. They could not: the page
sets `user-select: none` on `body` (so the app's windows feel native), and the Ask panel
inherited it, so a drag over the answer selected nothing. This plan makes the answer, its source
cards' host, title and snippet, and error text selectable, and adds a "Copy selection" button
that appears while a highlight is inside the panel.

Status: building (2026-10-09)

## Goals

- The answer text (plain answers, web answers with citation chips, the could-not-replace
  result, errors) and the source titles, hosts and snippets can be highlighted with the mouse.
- The highlighted part can be copied, without the panel taking focus from the user's app.
- Clicking or dragging in the text does not dismiss the panel, open a source, or paste.
- Citation chips stay clickable.

## Non-goals

- ⌘C inside the panel (see "Key decisions").
- Moving the window: the Ask panel is placed by the app above the pill and was never draggable;
  there is no `data-tauri-drag-region` in it, and none is added.

## Key decisions

- **Selectable by CSS only.** `.ask-glass-answer` and the source card's `.ask-source-host`,
  `.ask-source-title` and `.ask-source-snippet` set `user-select: text` and the text cursor.
  The rest of the panel (buttons, question line, footer) stays unselectable, so a click on a
  button never starts a highlight.
- **A highlight shows a blue tint.** WebKit draws an inactive window's selection in grey, which
  is hard to see on the glass; the panel's `::selection` is a translucent accent blue.
- **No ⌘C; a "Copy selection" button instead.** The panel is a non-activating panel that can
  never become key (plans `ask-panel-above-pill`, `pill-over-full-screen`), so key presses go to
  the user's app. Making it key while a highlight exists would take keyboard focus from the app
  that Insert and dictation rely on, and catching ⌘C globally would steal the user's own copy in
  their app. So while a non-empty highlight lies inside the panel (`selectionchange`,
  `src/components/AskPanel/selection.ts`), the footer shows "Copy selection". It copies through
  the app (`copy_ask_text`), like the source "Copy link" button, because the page is never
  focused and cannot use the browser clipboard. This changes plan `ask-web-search`'s "an answer
  offers no Copy button" only while the user has highlighted text.
- **The could-not-replace "Copied" button copies the highlight when there is one**, else the
  whole result, so that view does not get a second copy button.
- **A drag over a source card is not a click.** A card opens its page on click; when the click
  ends with a highlight, it does nothing, so selecting a title does not open the page.
- **Right-click "Copy".** WebKit's own context menu, when it shows for the panel, copies through
  AppKit without focus; Typelite neither adds nor blocks it.
- **Nothing is stored or logged.** The highlight lives only in component state; the app's copy
  log line has the character count only.

## Considered

- Making the panel key on mouse-down and handing focus back afterwards: focus would flicker in
  the user's app, and a missed hand-back would leave their caret dead.

## Parts

| File | Covers |
| --- | --- |
| `index.md` | The whole change; it is small enough for one file. |

## Open questions

- Whether WebKit, in a window that is never key, delivers mouse drags for selection on every
  macOS version (verified only by design; needs a check on a real Mac).
