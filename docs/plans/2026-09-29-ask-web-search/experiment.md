# Experiment: SearXNG for live questions

What a local SearXNG returns for three live questions, and whether a small model answers
correctly from it. Back to [index](index.md).

## Setup

- SearXNG `searxng/searxng:latest` in Docker, bound to `127.0.0.1` only, `settings.yml` with
  `use_default_settings: true`, `limiter: false`, `search.formats: [html, json]`. Default
  engines.
- Queries through `GET /search?q=…&format=json` with `language=en`, as the user would say them.
- AI: an OpenAI-compatible llama.cpp server on a GPU computer on the network running Qwen 3.5 4B
  (Q4_K_M) with thinking off, the size of model Typelite recommends for polish.
- Prompt: answer from the results only, cite `[n]`, results marked untrusted (the prompt in
  [architecture.md](architecture.md)). Date of the run: 2026-09-29.

## Results

### "what's the next match for the Golden State Warriors"

- General (32 results, 1.3 s): NBA.com schedule, Yahoo Sports schedule, ESPN "2026-27 Preseason
  Schedule" with the snippet "Sun, 10/4. vs LAC 7:00 PM; Tue, 10/6. vs LAL …", CBS Sports, USA
  Today. The ESPN snippet holds the answer; the others are pages with no date in the snippet.
- News (41 results, 1.0 s): Sports Illustrated team page, a Game 7 preview from three months ago,
  a 2025 Reuters article, media-day news from yesterday. No next game.
- Answer from general: "Sunday, October 4, 2026, against the Los Angeles Clippers at 7:00 PM [3]"
  — correct and cited. From news only: a months-old playoff game (wrong). From two news + three
  general: right date, wrong opponent (Lakers) and an invented "Portland Timbers".

### "where is the next F1 Grand Prix"

- General (35 results, 0.9 s): ESPN F1 calendar, formula1.com ("Next ROUND 16 Bahrain 02 - 04
  OCT"), BBC calendar, two travel sites. None says the race moved.
- News (85 results, 1.2 s): several articles from the last day saying the Bahrain Grand Prix
  moves to Sepang, Malaysia, on 2–4 October; a 2022 Reuters article.
- Answer from general: "the Bahrain race at the Bahrain International Circuit, 2–4 October" —
  wrong place. From news: "Bahrain at Sepang" — right. From two news + three general: "Sepang"
  with a wrong date in one run; the final prompt (with today's date) gave "the Bahrain Grand Prix
  in Malaysia, 2–4 October 2026 [1]", correct.

### "latest tech news today"

- General (39 results, 2.1 s): Reuters Technology, CNBC, WIRED, CNN Business, GeekWire; the
  snippets hold today's headlines.
- News (52 results, 1.1 s): a ScienceDaily index, a peripheral launch, a Reuters column from
  April, a "Top Tech News Today, September 28" roundup.
- Answer from general: three current headlines, each cited. From news: two headlines, no
  citations. From two news + three general: three headlines, each cited.

## What worked

- JSON works once `json` is in `search.formats`; without it SearXNG answers **403**.
- Latency: 0.6–2.1 s per search (warm), the AI answer 0.8–1.0 s. The whole live answer, with the
  live-question check, stays under about 4 s.
- `categories=news` finds what changed this week; `general` finds schedules and official pages.
  Mixing them (two news first) fixed the F1 answer without losing the others. A comma list
  (`categories=general,news`) is dominated by general results, so two requests are made.
- `time_range=month` changed little for these questions and drops undated pages, so it is not
  used.
- The model cited `[n]` in almost every answer when asked to.

## Failure modes seen

- Engines come and go: DuckDuckGo answered with a CAPTCHA in some runs, Bing News with
  connection errors. SearXNG lists them in `unresponsive_engines` and still returns results
  from the others.
- News results include old articles (2022, 2025); the date in the prompt and "prefer the most
  recent" help, but do not fully fix it.
- A 4B model sometimes mixes details between results (wrong opponent, invented team). The source
  links let the user check.
- No empty result sets for these questions; an empty set is handled (the panel says the search
  found nothing).
