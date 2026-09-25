# 0011 — Ask: translate selections, and live questions

Ask anything can translate highlighted text into a language the user picks, and it answers
honestly when a question needs live information that Typelite cannot fetch yet. Web search
itself is deferred; this plan leaves a clear place for it.

Status: agreed — 2026-09-25

## Goals

- Highlight text anywhere, then translate it in place into a chosen language, never a silent
  English default.
- Highlight text and say how to change it ("make this shorter"); the edit replaces it in place.
- A question that needs current information ("AI news today", "Bitcoin price", "weather in
  Tokyo") gets a clear, honest reply instead of an invented answer.
- The reply for live questions is the same screen a future "set up web search" step will use,
  including a way to skip.

## Non-goals

- Web search, search keys and search servers (a later plan).

## Key decisions

| Decision | Reason |
|---|---|
| Selected text + Translate shortcut with no speech = translate the selection in place | Fastest path; mirrors how Translation mode already works. |
| Target language = the language the user names, else the active translation language | The user chooses; no hidden English default. |
| While the selection translate is pending, the Switch language key cycles the target and the pill shows it | Same control as Translation mode. |
| Selected text + Ask + "translate this into X" keeps working, including Chinese variants | Matches Typeless, where highlight-translate is part of Ask. |
| Selected text + Ask + an edit instruction ("make this shorter", "改短一点") replaces the selection; questions about it answer in the panel | Edits are what the user wants in the text; the grammar decides, so it is instant and testable. |
| Live questions are detected by the AI (a small classification step) with a keyword fallback | Keywords alone miss many cases; the model already runs for Ask. |
| Live question reply: "This needs live information from the web, which Typelite can't look up yet." with **Answer anyway** and, later, **Set up web search** | Honest now; "Answer anyway" is the skip path the future setup reuses. |
| "Answer anyway" answers from the model's own knowledge with a visible note that it may be out of date | Useful when the user accepts that. |

## Parts

| File | Covers |
|---|---|
| [behaviour.md](behaviour.md) | Flows, detection, panel states. |

## Later: web search

When search is picked up again, the planned default is TinyFish (hosted, free search and fetch
with a free API key, live results, pages as Markdown) as a bring-your-own-key option in the
"Set up web search" step, with "Answer anyway" as the skip and a clear note that the question is
sent to TinyFish. A self-hosted SearXNG option stays available for users who want nothing to
leave their network. To check then: fetch latency, data retention in their privacy policy, and
whether the free tier still exists.

## Open questions

- None.
