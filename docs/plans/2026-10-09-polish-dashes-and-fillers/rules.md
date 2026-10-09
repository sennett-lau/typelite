# Rules and clean-up

What the prompt says and what the code changes after it. Back to [index](index.md).

## Prompt (`src-tauri/src/llm/prompt.rs`)

- Rule 1 gains **DASHES**: inside a sentence, never join or break clauses with a dash; use a
  comma or a period. Hyphens stay inside words and ranges. The rule says it does not change
  rule 3 (lists), because without that the model wrote enumerations as one line.
- Rule 2 has general rules for any language, with no word list. FILLERS: delete words or sounds
  that only show hesitation, stalling or thinking aloud, anywhere, also at the start; judge by
  meaning, with counter-examples (an answer "No", an apology, a cause "so", a contrast
  "actually", a liking "like"). SELF-CORRECTIONS: when the speaker changes their mind about a
  word, number, name or time, keep only the final version and drop the abandoned part and the
  correction phrase.
- New examples in three languages: English hesitation plus "no wait", Cantonese 即係 呃 plus a
  唔係 correction, Mandarin 那个 嗯 plus a 不对 correction, and an English counter-example where
  "No" and "sorry" are meaningful.
- The thought-aware rules name no marker list; the check list ends with "no hesitation sound or
  thinking-aloud phrase is left in any language, also at the start, and no dash joins two
  clauses".
- The Cantonese preset (version 4) says the same in general terms and keeps the tone particles
  啦 and 呢.
- The English language preset says to join clauses with commas and periods, not dashes.

## Dash clean-up (`src-tauri/src/llm/dashes.rs`)

A dash becomes ", " when:

- it is " - ", " – " or " — " (one dash, a space on each side), or an unspaced "—";
- the text before it ends with a word of two or more letters of a non-CJK script;
- the character after it (after the space) is such a letter.

Everything else stays: "well-known", "3 - 5", "9—5", "- milk" at the start of a line,
"x - y", "--force", URLs and paths, "——" and dashes next to Chinese, ", - ", a dash before a
number or symbol, and a dash at a line end.

It runs in `prompt::clean_dictation_output` together with the final-period rule, on the
same operations. While streaming, `FinalPeriodStream` shows text already cleaned and holds back
a trailing run of spaces, dashes and periods until the next character arrives.

## Hesitation sounds (`src-tauri/src/llm/hesitations.rs`)

Runs first in `clean_dictation_output`. It removes a small closed set of sounds that are never
words: um, uh, uhm, erm, hm (with repeated last letters: ummm, hmmm), euh, ehm, äh, ähm, öhm,
嗯 and 呃. Words with meaning (so, like, well, 那个, 就是, 即係) stay the prompt's job.

- Only a standalone sound: at the start, or after a space or punctuation, and before a space,
  punctuation or the end. Never inside a word ("umbrella"), in code spans, URLs, paths or file
  names ("um.txt"), and never 嗯 or 呃 directly after another Chinese character.
- Left out on purpose: "er" (German "he"), "eh" (German "anyway", Spanish "hey"), "mm"
  (agreement), and 啊 and 呀 (sentence particles).
- The comma or ellipsis after the sound goes with it; a sound at a sentence end takes the comma
  before it; a capitalised sound at a sentence start passes its capital to the next word.
- While streaming, `stable_prefix` holds back the last word and any sound before it, so the
  shown text is always a prefix of the final cleaned answer.
