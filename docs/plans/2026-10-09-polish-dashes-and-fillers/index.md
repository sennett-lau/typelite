# Polish: no clause dashes, fewer fillers

AI polish output sometimes reads as fragments joined by dashes ("I checked the logs - nothing
there", "the plan — the new one — is ready") and keeps fillers such as "I mean", "sorry" or
"no" from a self-correction. This plan tightens the polish prompt and adds one narrow,
deterministic clean-up for clause dashes in dictation.

Status: building — 2026-10-09

## Goals

- Dictation output uses commas and periods between clauses, not dashes.
- Fillers (um, uh, er, like, you know, I mean, so, well, actually, basically, kind of, 嗯, 呃,
  那个/那個, 就是, 然后/然後, 即係) are removed when they add no meaning; "X, no, I mean Y"
  keeps only Y.
- Meaningful words stay: "No, I don't agree" keeps "No", "sorry for the delay" keeps "sorry".

## Non-goals

- A deterministic filler remover. Whether "like", "so" or "no" is filler depends on meaning,
  which only the model can judge.
- Changing dashes in selected-text edits, Ask answers or Chinese text.

## Key decisions

| Decision | Reason |
|---|---|
| Short rules plus a few examples in the base prompt, not a long word list per language | Small models (Qwen3 4B, 1.7B) follow short, concrete rules and examples better than lists. |
| Fillers are named with a meaning test ("remove one only when it adds no meaning") and counter-examples | A blind list would drop "No" in "No, I don't agree" or "like" in "I like it". |
| Cantonese particles 呢 and 啦 are not listed as fillers | The Cantonese rule keeps sentence particles (啦 呀 喇); listing them would contradict it. 即係 is listed. |
| A post-process turns a clause dash into a comma, only between a word of two or more Latin letters and a letter, on one line | This shape is almost never a hyphen, range, list item, flag, path or code; everything else is left alone. |
| The dash clean-up runs only where the final-period rule runs (dictation, draft and translate insert without a selection) | Edits of selected text and answers keep the dashes the user or the source chose. |
| Streamed text holds back a trailing run of spaces, dashes and periods | The decision needs the character after the dash; the clean-up of a prefix is then a prefix of the clean-up of the whole answer, so typed text never has to be corrected. |

## Considered

- Replacing a clause dash with a period. A comma is safer: it never creates a sentence from a
  fragment and it suits parenthetical dash pairs.
- Removing dashes after a digit ("total - 40"). Left alone: too close to maths and ranges.

## Parts

| File | Covers |
|---|---|
| [rules.md](rules.md) | The prompt rules, the examples and the dash clean-up in detail |

## Open questions

- Whether the English language preset should also list English fillers, or the base prompt is
  enough.
