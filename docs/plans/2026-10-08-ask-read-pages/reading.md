# Reading the result pages

How the top result pages become a few short passages for the AI. Back to [index](index.md).

Code: `src-tauri/src/web_search/pages.rs`.

## Flow

```
search (as before) ──> top 3 result URLs ──fetch in parallel, 2.5 s──> HTML
   ──extract_blocks──> text blocks per page ──select_passages──> ≤ 2,400 chars of passages
```

The pill keeps showing "Searching the web…" while the pages are read, then "Thinking".

## Fetching

- Only result links that are http(s) (`is_openable_link`); redirects stay within http(s).
- Each page has the same 2.5 s timeout and all run at the same time, so the whole read takes at
  most about 2.5 s. A page that fails, times out, is not HTML or answers with an error status is
  skipped; the answer then rests on its snippet.
- At most 1.5 MB is read from a page. Pages are decoded as UTF-8 (invalid bytes replaced).
- The request sends a generic browser-like user agent and no cookies. It carries nothing about
  the user; the page sees the same request any reader would send.

## Extraction (reader mode)

A small scanner walks the HTML once:

- skipped with their content: `script`, `style`, `noscript`, `svg`, `template`, `iframe`,
  `textarea`, `head`, `select`, `button`, `canvas`, and comments;
- hidden until they close: `nav`, `header`, `footer`, `aside`, `menu` (page furniture);
- block tags (`p`, `div`, `li`, `tr`, headings, `br`, …) end a block; table cells in a row are
  joined with " | ", so a schedule row stays one line ("19 | Singapore Grand Prix | 11 October
  2026");
- entities are decoded and spaces folded; blocks under 8 characters are dropped and long ones
  are split near 300 characters at a space or sentence end, never inside a date.

## Passage selection

Each block is scored:

- one point for each question or query word it shares (words of three or more letters, or two
  with a digit like "f1"; for Chinese, Japanese and Korean, pairs of neighbouring characters);
- two points when it holds a date on or after today (read with `schedule::first_future_date_in`),
  for an upcoming question or when the block also shares a word;
- for an upcoming question, a block whose dates are all past loses a point.

Blocks with no score are dropped. The rest are taken best first, without duplicates, up to 2,400
characters in all and 1,200 from one page, then put back in page order. Each page's passages
travel in that result's block of the prompt, so they are cited with the result's number.
