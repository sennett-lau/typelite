# Polish: no clause dashes, fewer fillers

AI polish output sometimes reads as fragments joined by dashes ("I checked the logs - nothing
there", "the plan — the new one — is ready") and keeps fillers such as "I mean", "sorry" or
"no" from a self-correction. This plan tightens the polish prompt and adds one narrow,
deterministic clean-up for clause dashes in dictation.

Status: building — 2026-10-09

## Goals

- Dictation output uses commas and periods between clauses, not dashes.
- Fillers in any language (words or sounds that only show hesitation, stalling or thinking
  aloud) are removed when they add no meaning, also at the start; after a self-correction in
  any language only the final version stays.
- Meaningful words stay: "No, I don't agree" keeps "No", "sorry for the delay" keeps "sorry".

## Non-goals

- A deterministic filler remover. Whether "like", "so" or "no" is filler depends on meaning,
  which only the model can judge.
- Changing dashes in selected-text edits, Ask answers or Chinese text.

## Key decisions

| Decision | Reason |
|---|---|
| General, language-independent rules plus a few examples in different languages, no word list per language | No list can hold every filler and correction marker of every language; small models (Qwen3 4B) also degrade with long prompts. |
| Fillers are judged by meaning, with counter-examples ("No, I don't agree", "sorry for the delay") | A blind list would drop "No" in "No, I don't agree" or "like" in "I like it". |
| Cantonese particles 呢 and 啦 are not fillers | The Cantonese rule keeps sentence particles (啦 呀 喇); the Cantonese preset says so too. |
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

- Chinese stalling words that are also ordinary words (那个, 就是说, 即係, 然后) survive with the
  built-in 4B model under both the listed and the general rules (benchmark report
  `2026-10-09-polish-dashes-and-fillers`, round 2). Whether a larger model or a deterministic
  step is needed is open.
