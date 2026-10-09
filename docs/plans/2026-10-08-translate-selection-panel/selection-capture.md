# Reading the highlight

When Typelite reads the highlight, and how. Back to [index](index.md).

## When

| Shortcut | Reads the highlight |
|---|---|
| Ask | Always. Answering, translating and editing the highlight is what Ask is for. |
| Translate | Always. A highlight with no speech is translated in place. |
| Dictate | Only with Settings → AI polish → advanced → "Use selected text when dictating" on (off by default), because it sends the highlight to the AI on every dictation. |

`selection::should_capture_selection` holds this rule. The first end-to-end test found the
problem: the setting used to gate Ask and Translate as well, so with the default (off) Ask never
saw the highlight and a browser translation answered the spoken words alone.

## How

1. Save the clipboard and put a unique marker on it.
2. Wait (at most 400 ms) until Shift, Control, Option and Command are released, so the app
   receives a plain ⌘C, not ⌃⌘C from a still-held Ask key. Fn is not waited for.
3. Send ⌘C through System Events (`osascript`), the same route as the paste's ⌘V.
4. Poll the clipboard every 25 ms, for at most 500 ms, until the marker is gone. Browsers can
   take longer than the old fixed 100 ms.
5. Put the old clipboard back. Nothing selected means the marker stayed, so there is no highlight.

## Permissions

- No new permission. The copy uses the same two grants as the paste, which every user already
  has: Accessibility, and Automation of System Events (macOS asks once, at the first paste or
  copy).
- Safari and Chrome need nothing more: the keystroke goes to the frontmost app like a real ⌘C.
- If macOS refuses (error -1743 or 1002), the log says "macOS refused the copy keystroke" and
  names both settings. Ask then answers without the highlight.

## Log

`Selected text capture: backup_len=…, selected_len=…, wait_ms=…`. These are lengths and time
only, never text.
