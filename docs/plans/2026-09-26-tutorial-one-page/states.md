# Exercise states

What an exercise page shows while a real shortcut run happens, and when its result is decided.
Back to [index](index.md).

## States

| State | Starts when | Result line |
|---|---|---|
| Ready | The page opens, or Try again | Empty; selection exercises: "The text above is highlighted for you." |
| Listening | `pipeline:voice_mode` is this role's mode (Ask: `pipeline:state` = `ask_recording`) | "Listening… press <keys> again when you finish." Translate: "Listening… press <first key> to stop, <switch> to switch language." |
| Writing | Recording stopped (`transcribing`, `polishing`, `outputting`, Ask: `ask_thinking`) until the result is decided | Three dots and "Typelite is writing…" (Ask 1: "Thinking…") |
| Success | The check passed | Empty; the top card is the result card |
| Not quite | The check failed | "ⓘ Not quite what we expected. Try again" |
| Didn't catch that | `pipeline:error` with `stt_no_speech_detected` | "ⓘ Didn't catch that. Try again" |
| Error | Any other pipeline error or a failed paste | "ⓘ That did not work (…). Try again" |

A success stays until the page is left. Try again starts the page afresh (box, run and state).
A recording cancelled before anything was written goes back to Ready.

## When the result is decided

1. Dictate and Translate land at a `pipeline:insert_result` that did not fail. It carries
   `charsInserted`.
2. The page then waits until the box holds that many new characters and has stayed unchanged
   for a moment (150 ms). If the count is never reached (the paste was held for Copy, or the
   text differs), it decides once the box has not changed for 600 ms.
3. Ask lands at `ask:result`. When Ask replaced the selection (`insertedText`), the page waits
   for the box to change and settle in the same way; otherwise it decides at once.
4. A later change of the box re-runs the check, so a slow paste can still turn a "Not quite"
   into a success.

## Result card

The top card becomes the result card in the primary accent colour, with ✓ and a title:

| Exercise | Title | Change shown |
|---|---|---|
| Change your mind | Only your correction was kept. | What was said, with the removed words struck through |
| Fillers disappear | Fillers removed. | As above |
| Speak and translate | Translated into <language>. | said → result |
| Translate a selection | Selection translated into <language>. | original → result |
| Ask a question | Answered in the Ask window. | question → answer |
| Edit by voice | Rewritten shorter. | original → result |

The struck-through view is a word diff between the transcript and the written text: words only
in the transcript are struck through, the others show as written. With no transcript it shows
only the written text. Long text is cut to two lines.
