# Notes: cantonese-hong-kong

For reviewers; not downloaded by the app.

## Sources

- The built-in Hong Kong translation default in Typelite (`src-tauri/src/llm/prompt.rs`):
  Cantonese words versus written-Chinese words, code-mixing, Hong Kong vocabulary, digits, and
  the English → Cantonese examples.
- A Cantonese polish preference written and tested for dictation in Hong Kong Cantonese mixed
  with English: keep code-mixing and swear words, do not make the text more formal, and the
  Cantonese hesitation sounds and self-correction words, with the Cantonese examples.

## Version 3

- Says that speech recognition may write Cantonese speech as written Chinese, and asks the model
  to put the Cantonese words back (more written-Chinese → Cantonese pairs, one example of it).
- The model hint points to the speech model, which matters more than the polish model.

Tested with Typelite's real polish prompt, a 4B Qwen 3.5 model in Ollama (thinking off,
temperature 0.3), ten everyday Cantonese sentences with fillers, a self-correction, English words
and a swear word, two runs each. "Similar" is how close the output is to what was said.

| Transcript polish received | Similar to what was said | Written-Chinese words left |
|---|---|---|
| whisper large-v3-turbo (written Chinese) | 62% (version 2: 63%) | 64 |
| Qwen3-ASR, in Hong Kong characters | 96% | 0 |

With a Cantonese transcript the preset keeps Cantonese, English words and swear words, and removes
fillers. With whisper's written-Chinese transcript it puts back only a few words: the words whisper
changed or misheard are gone before polish sees them. See
[Choosing a model → Cantonese](../../../docs/guides/languages/cantonese.md).

Known gap: a self-correction without pauses ("下個禮拜三唔係禮拜四") was sometimes resolved to the
wrong day.

## Earlier test (the polish preference only)

The polish preference alone, with the same model: nine dictations, three runs each.

| Check | Without | With |
|---|---|---|
| Swear words kept | 3 of 6 | 6 of 6 |
| Mixed Cantonese and English kept (not translated to English) | 0 of 6 | 6 of 6 |
| Written as Cantonese, not Mandarin or formal Chinese | often wrong | always right |
| Fillers removed (嗯, 呃, um) | 0 of 9 | 9 of 9 |
| Self-corrections applied | 8 of 9 | 9 of 9 |

A one-line version ("mix of Traditional Chinese and English terms") was not enough. Stock Qwen 3
and 3.5 refuse some Cantonese swear words whatever the prompt says.
