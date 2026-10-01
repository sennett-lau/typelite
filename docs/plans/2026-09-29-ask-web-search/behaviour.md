# Behaviour

The Ask flow with web search, the panel states, Settings and onboarding. Back to
[index](index.md).

## Ask flow

```
open question ──> live check (AI, keyword fallback)
                    │ not live ──> answer from the model (as before)
                    │ live
                    ├─ no search provider ──> panel: needs live information (Set up web search)
                    └─ provider set ──> search (general + news, ≤ 4 s)
                           ├─ failed ──────> panel: search did not work (Answer anyway)
                           ├─ no results ──> panel: search found nothing (Answer anyway)
                           └─ results ────> AI answers from ≤ 5 results ──> answer + sources
```

- Only open questions (no selection) are checked, as in plan `ask-translate-and-live-questions`.
  Site searches ("search standing desks on Amazon") still open the site.
- The search and the answer count as the run's AI step in Insights.
- An AI failure after a search is shown as an Ask error, like any other.
- Escape while thinking cancels the search too.

## Ask panel

| State | Body | Buttons |
|---|---|---|
| Web answer | The answer with `[n]` markers. The footer shows "N sources" with a letter mark per site; it opens the sources column (below). | N sources |
| Live, no provider | "This question needs up-to-date information from the web. Web search is not set up; you can add a search server in Settings." | Set up web search (opens Settings → AI polish, closes the panel), Answer anyway |
| Live, search failed | "… but the web search did not work. Check the search server in Settings." | Answer anyway |
| Live, no results | "… but the web search found nothing." | Answer anyway |

Answer anyway keeps its note "May be out of date — no web search was used".

### Size

| Rule | Reason |
|---|---|
| A short answer keeps the 420 pt panel; the open sources column adds 288 pt | Short answers stay compact by the pill. |
| An answer over 360 characters or 5 lines widens the panel to its maximum | Long answers read better in wider lines than in a tall, narrow scroll. |
| The maximum is ⅔ of the work area's width and ½ of its height (never below 420 pt wide or 240 pt tall, never outside the screen margins); past it the answer scrolls | The panel never covers most of the screen. `ask_panel_limits` gives the page the numbers; `resize_ask_panel` reports width and height, and the app caps both. |
| The window stays centred on the pill and keeps its bottom edge 10 pt above it as it grows | Same anchor rule as plan `ask-panel-above-pill`. |

### Sources column

Layout: the column runs the full height of the panel on its right, with its own "Sources" header
and a › that hides it. The shell and source rail expand or collapse together over 320 ms; source content fades in
within the rail. The answer keeps its height and sources scroll within it. Reduced motion
skips the movement, and reopening while closing reverses the transition. A clicked citation
scrolls its source into view. The question, the answer and the footer stay in the left column, because
the footer's buttons act on the answer (the pattern of ChatGPT's and Perplexity's source panels).

| Part | Behaviour |
|---|---|
| Card | Letter mark and site, the citation number, the title and a two-line snippet from the search result. |
| Hover | Open and Copy link appear over the number. A click on the card also opens the page. |
| Open | Opens the page in the default browser (through the app; the panel never takes focus); the button shows "Opened ✓" for 1.5 s. The panel stays open. |
| Copy link | Puts the address on the clipboard (through the app); "Copied ✓" for 1.5 s. |
| `[n]` in the answer | A click opens the column with card n highlighted; hover highlights card n. |
| New message | The column starts closed. |

Letter marks, not site icons: loading an icon would contact the site.

### Look

The panel takes the pill's aurora (plan `aurora-pill`): two large blurred blobs of
`--color-aurora-a` and `--color-aurora-b` behind plain dark glass, drifting slowly (still with
reduced motion). Dark mode uses darker glass (74 %) and dimmer blobs pushed to the corners, so the
answer text keeps its contrast. The ✕ is top right; the sources column hides with ›, so the panel
has one ✕.

## Settings → AI polish → Web search for Ask

- Help: what it does, that it is off until the user adds a search server, and that SearXNG is
  free and runs on their computer.
- Fields: **Provider** (SearXNG for now), **Address**, **Key** (optional; shows "Saved in the
  Keychain" when one is stored). A note says the question is sent to this server when Ask needs
  live information, with a link to the guide.
- **Test** searches a fixed word and shows "Works: N results in T", or the reason (JSON off,
  unreachable, timeout, status).
- **Save** stores the address (and a typed key); an empty key field keeps the stored key.
  **Remove key** deletes the key. **Turn off web search** deletes the address and key.
- The section saves by itself, not through the Save bar, because the key lives in the Keychain.

## Onboarding

The AI step has a collapsed "Web search for Ask (optional)" card under the AI setup with the same
form. Skip and Next ignore it.

## Language

Strings in English and Chinese; Chinese uses 问答 for Ask ("问答的网络搜索").
