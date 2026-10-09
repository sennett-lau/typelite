# Select and copy text in the Ask panel

Users want to highlight part of an Ask answer and copy only that part. They could not: the page
sets `user-select: none` on `body` (so the app's windows feel native), and the Ask panel
inherited it, so a drag over the answer selected nothing. This plan makes the answer, its source
cards' host, title and snippet, and error text selectable; ⌘C copies the highlight.

Status: building (2026-10-09)

## Goals

- The answer text (plain answers, web answers with citation chips, the could-not-replace
  result, errors) and the source titles, hosts and snippets can be highlighted with the mouse.
- ⌘C copies the highlight, and the panel does not take focus from the user's app.
- Clicking or dragging in the text does not dismiss the panel, open a source, or paste.
- Citation chips stay clickable.

## Non-goals

- A separate "Copy selection" button: ⌘C does the job.
- Moving the window: the Ask panel is placed by the app above the pill and was never draggable;
  there is no `data-tauri-drag-region` in it, and none is added.

## Key decisions

- **Selectable by CSS only.** `.ask-glass-answer` and the source card's `.ask-source-host`,
  `.ask-source-title` and `.ask-source-snippet` set `user-select: text` and the text cursor.
  The rest of the panel (buttons, question line, footer) stays unselectable, so a click on a
  button never starts a highlight.
- **A highlight shows a blue tint.** WebKit draws an inactive window's selection in grey, which
  is hard to see on the glass; the panel's `::selection` is a translucent accent blue.
- **⌘C reaches the panel.** The first version of this plan assumed it could not, because the
  panel never becomes key, and added a "Copy selection" button. A test on a real Mac showed ⌘C
  after a highlight copies it, so the button was removed. The reason, as far as we can tell: a
  non-activating `NSPanel` still receives the mouse-down that makes the highlight, and AppKit
  offers key equivalents such as ⌘C to such a panel's web view (`performKeyEquivalent:`), which
  runs WebKit's `copy:` on its own selection. The user's app keeps focus and its caret.
- **The could-not-replace "Copied" button copies the highlight when there is one**, else the
  whole result (`src/components/AskPanel/selection.ts` follows the highlight).
- **A drag over a source card is not a click.** A card opens its page on click; when the click
  ends with a highlight, it does nothing, so selecting a title does not open the page.
- **Nothing is stored or logged.** The highlight lives only in the page; the app's copy log line
  has the character count only.

## Considered

- Making the panel key on mouse-down and handing focus back afterwards: not needed, and focus
  would flicker in the user's app.
- A "Copy selection" button: dropped once ⌘C was shown to work (see above).

## Parts

| File | Covers |
| --- | --- |
| `index.md` | The whole change; it is small enough for one file. |

## Open questions

- None.
