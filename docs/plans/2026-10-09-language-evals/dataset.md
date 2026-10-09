# Dataset

What the evaluation data looks like and how it grows. Back to [index](index.md).

## Layout

```
evals/
  languages.json                  unit (word|char), fillers, dialect per language
  polish/<lang>/dev.jsonl         tuning cases
  polish/<lang>/holdout.jsonl     never used for tuning
  speech/<lang>/manifest.jsonl    clips: audio path, exact text, source, licence, speaker
  speech/<lang>/audio/            committed recordings; audio/synthetic/ is generated
  baselines/<kind>-<model>.json
```

Language folders use BCP-47-style names: `en`, `yue` (Cantonese, Hong Kong, Traditional),
`zh-Hans` (Mandarin, Simplified), `fr`, `es`, `ja`. The seed has 30–40 dev and 10 holdout cases
for each main language and 10 for each smaller one.

## Cases

Inputs are what Whisper gives: no punctuation, fillers, repeats, run-ons, spoken numbers,
spoken enumerations, mixed Cantonese and English. Expected answers follow the polish rules the
owner wants for every language. Counter-examples matter as much: "No, I don't think…", "actually"
as content, 唔係 as a negation, a leading 不对 that corrects nothing. Where several answers are
right (a list or an inline list, 三點 or 3點), `accept` holds the others.

The full field list is in `evals/README.md`.

## Speech clips

Clips carry the exact words, licence and speaker. The seed is synthetic (`say` voices Samantha,
Daniel, Sinji, Tingting) and taken from PR #82's sentences: good enough to show Whisper writing
Cantonese as standard Chinese, too clean to measure real accuracy. Real recordings replace them
over time.

## Contribution rules

CC0-1.0 or CC-BY-4.0; consent for every voice; no private data. Holdout cases are not edited to
pass. These rules are repeated in `evals/README.md`, which contributors read.
