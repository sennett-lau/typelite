# Ask: web search for live questions

Ask anything answers questions that need live information (news, scores, schedules, prices) by
searching the web with a search provider the user runs or chooses, then answering from the top
results with numbered source links. The first provider is SearXNG, a free, self-hosted
metasearch engine. Search is off until the user adds one; without it Ask keeps the honest
"needs live information" reply of plan
[`ask-translate-and-live-questions`](../2026-09-25-ask-translate-and-live-questions/index.md),
now pointing to Settings.

Status: building — 2026-09-29

This plan replaces the "Later: web search" section and the "no web search" non-goal of plan
`ask-translate-and-live-questions`: the default is a self-hosted SearXNG, not a hosted service.

## Goals

- A live Ask question gets a correct, short answer from current web results, with the pages it
  used as links that open in the browser.
- Nothing leaves the user's machines by default: no provider is set, and none is bundled.
- One place to set, test, change or remove the search provider (Settings), and an optional,
  skippable card in onboarding.
- Settings shaped as a "search provider" with an optional key, so providers with the user's own
  key can be added without changing the flow.
- Search results can not steer the AI: they are untrusted data in the prompt.

## Non-goals

- Fetching and reading whole pages (only the search snippets are used).
- A hosted or bundled search service, and any provider that needs a paid plan.
- Searching for questions that are not live, or for Dictate and Translate.
- Storing questions, results or answers (plan `speed-by-preset` keeps timings only).

## Key decisions

| Decision | Reason |
|---|---|
| SearXNG first, through its JSON API (`/search?q=…&format=json`) | Free, open source, self-hosted, no key, many engines at once. |
| Off until the user enters an address; no default address | Hard constraint: no cloud by default, and nothing to guess. |
| Settings are `{provider, base_url}` in the settings file and an optional key in the Keychain (namespace `search`) | Same split as the speech and AI presets; room for keyed providers. |
| The optional key goes out as `Authorization: Bearer` | Covers a SearXNG behind a token proxy; keyed providers will map it their way. |
| Search only after the live-question check says live | Timeless questions never reach the search server. |
| Search the general and news categories in parallel; two news results first, then general, five in all | The experiment: general finds schedules, news finds what changed this week; either alone got one of three wrong. |
| 4 s timeout per request, one failing category is fine | Ask must stay quick; SearXNG itself waits on slow engines. |
| Snippets capped at 400 characters, titles at 160, HTML removed, only http(s) links | Small prompt for a small model; nothing odd reaches the panel. |
| Results sit in `<search_results>`, marked untrusted, `<` and `>` removed from them | Prompt-injection guard, like `<selected_text>`; a result cannot close the block. |
| The answer cites `[n]`; the panel shows the cited results (all five when none is cited) | Short answers the user can check. |
| The panel opens only links of the answer on screen, http(s) only, through the app | The panel never takes focus; no arbitrary URL opening from the web page. |
| Test searches one fixed word | The user's own words are never sent by a test. |
| Search failed or found nothing: the live panel says which, with Answer anyway | Honest, and the user still gets an answer when they accept it. |
| Log provider id, result counts and timings only | Hard constraint: no content in logs. |

## Parts

| File | Covers |
|---|---|
| [experiment.md](experiment.md) | SearXNG run locally: the three test questions, results, answers, latency, failure modes. |
| [behaviour.md](behaviour.md) | The Ask flow, panel states, settings and onboarding. |
| [architecture.md](architecture.md) | Modules, prompt, commands, storage, tests. |

## Considered

- **A hosted search API as the default** (the earlier plan's choice): needs an account and sends
  every live question to a company. It can come later as an opt-in provider with the user's key.
- **Asking the AI to call a search tool**: small local models are unreliable at tool calls; the
  live-question check already decides.
- **Reading the result pages**: slower (seconds per page) and a bigger prompt; snippets were
  enough in the experiment.

## Open questions

- Which keyed provider to add second (Brave Search API, Tavily), and how each maps the key.
- Whether to pass the speech language to SearXNG's `language` parameter for non-English
  questions (the experiment used English only).
