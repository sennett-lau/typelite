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
| Web answer | The answer with `[n]` markers; under it "Sources" and a numbered chip per cited page (the host, full title and address on hover). A click opens the page in the browser. | Copy, Insert |
| Live, no provider | "This question needs up-to-date information from the web. Web search is not set up; you can add a search server in Settings." | Set up web search (opens Settings → AI polish, closes the panel), Answer anyway |
| Live, search failed | "… but the web search did not work. Check the search server in Settings." | Answer anyway |
| Live, no results | "… but the web search found nothing." | Answer anyway |

Answer anyway keeps its note "May be out of date — no web search was used".

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
