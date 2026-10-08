# Rules and clean-up

What the prompt says and what the code changes after it. Back to [index](index.md).

## Prompt (`src-tauri/src/llm/prompt.rs`)

- Rule 1 gains **DASHES**: never join or break clauses with a dash; use a comma or a period.
  Hyphens stay inside words and ranges.
- Rule 2 names the fillers and gives the meaning test with three counter-examples ("No, I don't
  agree", "sorry for the delay", "I like it"). The self-correction markers include
  "X, no, I mean Y".
- New examples: a correction with "no sorry I mean", English fillers around plain content, a
  sentence where "No" and "sorry" are meaningful, and Cantonese 嗯 即係 呃.
- The thought-aware check list ends with "no filler is left and no dash joins two clauses".
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
