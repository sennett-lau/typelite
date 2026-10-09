# Select and copy text in the Ask panel

Users want to highlight part of an Ask answer and copy only that part with ⌘C. They could not:
the page sets `user-select: none` on `body` (so the app's windows feel native) and the Ask panel
inherited it, and the panel is never the key window, so ⌘C went to the user's app. This plan
makes the answer, its source cards' host, title and snippet, and error text selectable, and
lets the panel become key, without activating Typelite, while the user works with its text.

Status: building (2026-10-09)

## Goals

- The answer text (plain answers, web answers with citation chips, the could-not-replace
  result, errors) and the source titles, hosts and snippets can be highlighted with the mouse.
- ⌘C copies the highlight; ⌘A highlights the whole answer.
- Typelite is never activated, and keyboard focus goes back to the user's app when the panel
  closes, when the user clicks into their app, and before Insert pastes.
- Clicking or dragging in the text does not dismiss the panel, open a source, or paste.
- Citation chips stay clickable. Escape works as before.

## Non-goals

- A "Copy selection" button: ⌘C does the job.
- Moving the window: the Ask panel is placed by the app above the pill and was never draggable;
  there is no `data-tauri-drag-region` in it, and none is added.

## Key decisions

- **Selectable by CSS only.** `.ask-glass-answer` and the source card's `.ask-source-host`,
  `.ask-source-title` and `.ask-source-snippet` set `user-select: text` and the text cursor.
  The rest of the panel stays unselectable, so a click on a button never starts a highlight.
  The panel's `::selection` is a translucent blue (WebKit's inactive grey is hard to see).
- **Key without activation.** The panel is a non-activating `NSPanel` (plan
  `pill-over-full-screen`). Such a panel may be the key window while another app stays active:
  key presses reach its web view, the user's app stays frontmost and its menu bar stays. The
  panel's `canBecomeKeyWindow` answers from Tauri's `focusable` variable, which stays false
  until the user presses in the panel's text or a highlight appears in it. Then the page calls
  `focus_ask_panel`, which sets the variable and sends `makeKeyWindow` on the main thread
  (`overlay_window::set_key`). A plain window (the swap was skipped) is never made key.
- **⌘C is handled by the page.** A `keydown` listener copies the highlight inside the panel
  through `copy_ask_text` when it sees ⌘C, rather than the Edit menu's key equivalent, which
  belongs to the active app (not Typelite). ⌘A selects the answer. The app logs only "Ask
  panel: copied (N chars)".
- **Giving key back.** `overlay_window::set_key(false)` clears `focusable` and, when the panel
  was key, orders it out and back in: the window server then returns keyboard focus to the
  active app's window. `ask_panel::close` (Escape, ✕, a new run, after Insert) does this before
  hiding, so a new run reads the highlight and pastes into the user's app. Insert and "Try
  replacing again" do it before sending ⌘V and wait 120 ms for focus to settle. A click into the
  user's app makes its window key as usual.
- **Insert targets are unchanged.** They paste into the frontmost app, which stays the user's
  app because Typelite is never activated; only keyboard focus needed to move back.
- **Escape is unchanged.** It is handled by the app's key tap while the panel is open, whether
  or not the panel is key.
- **The could-not-replace "Copied" button copies the highlight when there is one**, else the
  whole result (`src/components/AskPanel/selection.ts` follows the highlight).
- **A drag over a source card is not a click.** When the click ends with a highlight, the card
  does not open its page.
- **Nothing is stored or logged.** The highlight lives only in the page.

## Correction

An earlier revision of this plan said a test on a Mac showed ⌘C already reached the panel, and
removed a "Copy selection" button. That report was misread: ⌘C went to the user's app, as the
first revision expected. This revision makes ⌘C work by making the panel key.

## Considered

- A "Copy selection" button: works without focus, but users expect ⌘C.
- Activating Typelite on a press: the user's app would lose its active state and menu bar.
- Catching ⌘C in the global key tap: would steal the user's own ⌘C in their app.

## Parts

| File | Covers |
| --- | --- |
| `index.md` | The whole change; it is small enough for one file. |

## Open questions

- Whether ordering the panel out and in always returns keyboard focus to the user's app on
  every macOS version, and whether 120 ms is enough before Insert's ⌘V (needs a check on a
  real Mac).
