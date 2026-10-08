# Ask: read the result pages before answering

Live questions in Ask anything ("when is the next F1 race", "next NBA game", "next Hong Kong
Premier League match") often ended in the "Needs live information" panel even though web search
worked: the AI saw only ~200-character search snippets, and upcoming-event questions went through
a strict extraction that needed the event name and date copied verbatim from one snippet. Typelite
now reads the top two or three result pages, keeps the passages that fit the question, answers
through the normal web-answer path of plan [`ask-web-search`](../2026-09-29-ask-web-search/index.md),
and checks every date in the answer against the text the AI was given. The approach is the same
for every topic: no per-sport, per-league or per-site code.

Status: building — 2026-10-08

## Goals

- Answer schedule and other live questions from page text, not only from snippets.
- Stay topic-independent: one generic reader, ranking and date check.
- Fit a small local model: page text is capped so the whole request stays well inside ~4k tokens.
- When search worked but the answer cannot be confirmed, show the sources with a plain message
  instead of the "needs up-to-date information" dead end.

## Non-goals

- Connectors for sports, leagues or other data sites.
- A full browser: no JavaScript, no cookies, no logins. A page that only renders in a browser
  gives no text and the answer uses its snippet.
- Fetching anything that is not a search result.

## Key decisions

| Decision | Reason |
|---|---|
| Read the first three results in parallel within 2.5 s in all, 1.5 MB per page, HTML only | Enough for the pages that usually hold the answer, without making Ask feel slow. |
| A small built-in reader (tag scanner) instead of an HTML parser crate | Only text is needed; it is plain Rust, has no new dependency and a broken page only gives less text. |
| Rank blocks by shared question words plus a bonus for a date on or after today | Generic for any topic; schedule rows rarely repeat the question's words but do carry future dates. |
| Cap page text at 2,400 characters (1,200 per page) | Leaves room for the prompt, five snippets and the answer in a ~4k-token context. |
| One answer path for every live question; the schedule-only extraction is removed | Rewording or a thin snippet rejected every event ("5 extracted, 0 accepted"); the normal path cites sources and handles all topics. |
| Check dates, not wording: each explicit date in the answer must appear (normalised) in the given text, and not before today for an upcoming question | Keeps the protection against invented dates without demanding verbatim copies. |
| A failed check shows the sources with "couldn't confirm", not the live-information panel | The search worked; the user can still open the pages. |
| `regex` (MIT/Apache-2.0, already in `Cargo.lock`) for date finding | Plain, readable patterns; no new code downloaded. |

## Parts

| File | Covers |
|---|---|
| [reading.md](reading.md) | Fetching pages, reader-mode extraction, passage selection |
| [answering.md](answering.md) | The prompt, the date check, the unconfirmed state, logging and privacy |

## Considered

- Per-league or per-sport APIs: rejected; they cover a few topics, need upkeep and often keys.
- A second search with a rewritten query when pages hold nothing relevant: left out for now; it
  doubles the wait for the cases that already fail, and the sources view covers them.
- Keeping the verbatim extraction as a first try: rejected; it rarely succeeds on thin snippets
  and adds an AI request.

## Open questions

- Dates in Spanish, French or German wording ("11 de octubre", "11. Oktober") are not read by the
  check yet, so such dates pass unchecked. Add patterns if wrong dates show up in those languages.
- Some sites block requests without cookies or render with JavaScript only; measure how often
  the page read gives nothing.
