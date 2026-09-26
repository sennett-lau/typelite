# Panel

Where the Ask panel goes, what it shows for each outcome, and when it closes. Back to
[index](index.md).

## Placement

```
            ┌──────────── screen (logical points) ────────────┐
            │                                                 │
            │        ┌──────── panel, 420 pt ────────┐        │
            │        │ question                    ✕ │        │
            │        │ answer (scrolls past 190 pt)  │        │
            │        │ Esc to close     Copy  Insert │        │
            │        └───────────────────────────────┘        │
            │                  10 pt gap                      │
            │               ( pill frame )                    │
            └─────────────────────────────────────────────────┘
```

- **Anchor.** When the panel opens, the pill's frame comes from the capsule window: its logical
  frame (physical position and size divided by that window's scale factor) inset by the
  capsule's 12 pt padding. The anchor is the pill's horizontal centre and top edge, plus the
  logical rectangle of the screen that holds the pill's centre (each screen divides by its own
  scale factor). With no visible pill, the screen under the cursor is used and the pill's place
  is assumed at its usual spot (centre 80 pt above the bottom, last known pill height).
- **Frame.** Panel width 420 pt; the window adds 16 pt on each side for the shadow. The panel's
  bottom is 10 pt above the pill's top; its height is what the page reports. The panel stays
  8 pt inside the screen on every side; a narrow screen aligns it to the left margin, and a
  very tall panel is capped to the screen.
- **Updates.** A height change recomputes the frame from the stored anchor, so the bottom edge
  stays put and the panel grows upwards. The panel's own position is never read back.

## Content

| Outcome | Header | Body | Footer actions |
|---|---|---|---|
| Answer | question in grey; "About the highlight · " first when the highlight was used | answer, and the "May be out of date" note after "Answer anyway" | Copy, Insert |
| Edit that could not replace | same | the result, then "This app didn't allow the replacement. The result is on your clipboard." | Try replacing again, Copied ✓ |
| Needs live information | question | the existing explanation | Answer anyway |
| Opened a site search | question | "Opened … search." | — |
| Error | "Something went wrong" | the error message | — |

Every panel has ✕ (Escape) in the header and "Esc to close" in the footer. Copy shows
"Copied ✓" for a moment. Insert pastes at the cursor (replacing the highlight when one was used)
and closes the panel; if the paste fails the panel says so and stays.

## Closing

| Event | Panel |
|---|---|
| Escape while the panel is open and no run is active | closes; Escape is swallowed |
| Escape while nothing of Typelite's is up | untouched; Escape reaches the app |
| ✕ | closes |
| A new Dictate, Translate or Ask run starts | closes |
| Insert or "Try replacing again" succeeds | closes |
| The frontmost app changes, or the user clicks elsewhere | stays |
