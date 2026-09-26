# Thinking models

Some models "think" (reason step by step) before they answer. Polishing a dictation needs no
reasoning, and a thinking model can spend many seconds on it, or use up its token limit and return
empty text. Use a non-thinking (instruct) model, or turn thinking off.

Built-in models always run with thinking off.

How to turn it off for each server, and where to enter the setting, is in
[Choosing a model → Turn off thinking](../models.md#turn-off-thinking). The service cards also
list it for their service (see [AI polish](README.md#services)).

## How to tell

- Test passes, but polish takes several seconds even for one short sentence.
- Polish returns nothing, or the log (`~/Library/Logs/Typelite/typelite.log`) says the content was
  empty and reasoning text was used instead.
- The model's name has "thinking" or "reasoning" in it, or its card says it thinks by default
  (Qwen3 base models, Qwen3.5, DeepSeek-R1 and others).
