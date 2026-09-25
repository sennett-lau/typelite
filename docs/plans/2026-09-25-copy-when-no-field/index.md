# Copy pill when there is nowhere to paste

When a dictation or translation finishes and no text field has focus, Typelite does not paste
into nothing. The pill widens, shows the start of the result and a **Copy** button, and a
countdown runs around the button's border. Also: smoother changes between every pill state. The
visual reference is [mock.html](mock.html) (countdown option 3, one-line pill).

Status: done — 2026-09-25

## Goals

- No result is lost because the user was not in a text field (the pill follows the cursor's
  screen since [pill-follows-cursor-and-escape](../2026-09-25-pill-follows-cursor-and-escape/index.md), so this happens more often).
- Every pill state change animates smoothly.

## Non-goals

- Ask anything: its answer already opens in the Ask panel.
- A history of results (the app keeps none by design).

## Key decisions

| Decision | Reason |
|---|---|
| Focus check with macOS Accessibility: the system-wide focused element's role and whether its value or selected-text range is settable | Typelite already has the Accessibility permission for pasting. |
| Skip the paste only when the answer is clearly "no text field"; when unknown (error, no focused element reported by an app that hides its fields), paste as today | Some web and Electron apps report their fields poorly; they must not lose paste. |
| One-line pill: optional language tag, the result truncated with an ellipsis, **Copy** (about 300–360 pt wide) | User: the one-line pill is enough, also for translate. |
| The countdown is the Copy button's border draining (8 s); no line inside the pill | User chose option 3: nothing overlaps the button. |
| Hover pauses the countdown; Esc closes; Copy writes the full result, shows "Copied", hides after about 1 s | Time to read and act; the existing Escape handling from plan `pill-follows-cursor-and-escape` is reused. |
| After Copy the clipboard is not restored | The user asked for the text. |
| Clicking the pill never takes focus from the frontmost app | The pill is already a non-activating panel. |
| Transitions: width, height and corners animate together (about 0.28 s); the old content fades out with a slight blur while the new fades in; the aurora light and the done flash fade; hiding slides down 6 pt and fades; reduced motion keeps only fades | User: "as smooth as possible". |
| Unknown focus covers every role apps also use for custom text views (groups, scroll areas, windows, web areas, tables, canvases); see [focus-check.md](focus-check.md) | A wrong "no text field" loses a paste; a wrong "unknown" only pastes into nothing, as before. |
| Streaming insertion checks focus once before it starts and does not stream when there is no text field; the final result takes the normal check | Streaming cannot be taken back once typed. |
| A changed target app keeps its copy-to-clipboard fallback; copy-only output never checks | Those results are already on the clipboard, nothing is lost. |
| The pill is 300 pt for a short result and 360 pt for a longer one (CJK characters and the language tag count) | Short results do not leave an empty gap. |
| The pill keeps its left edge, as every other state does, so it grows to the right | Moving the window while resizing it is two steps and would jump for a frame. |
| The window grows before the pill animates larger and shrinks only after it animated smaller; it hides after the hide animation | The native window must never clip the pill mid-animation. |
| While hiding, the pill keeps what it last showed (for example "Done" or the Copy pill) | It slides away as it was instead of shrinking to a dot. |
| The countdown ring still drains with reduced motion | It is information, not decoration. |

## Parts

| File | Covers |
|---|---|
| [mock.html](mock.html) | Interactive reference (choose "3 · Button border"). |
| [focus-check.md](focus-check.md) | How the focus is judged, when it is checked, and the held result. |

## Open questions

- None.
