# Notes: cantonese-hong-kong

For reviewers; not downloaded by the app.

## Sources

- The built-in Hong Kong translation default in Typelite (`src-tauri/src/llm/prompt.rs`):
  Cantonese words versus written-Chinese words, code-mixing, Hong Kong vocabulary, digits, and
  the English → Cantonese examples.
- A Cantonese polish preference written and tested by the maintainer for dictation in Hong Kong
  Cantonese mixed with English: keep code-mixing and swear words, do not make the text more
  formal, and the Cantonese hesitation sounds and self-correction words, with the two Cantonese
  examples.
- This preset supersedes the maintainer's earlier local guide
  `docs/guides/cantonese-polish-prompt.md`, which was never committed; use this preset instead.

## Earlier test (polish preference only)

The polish preference alone was tested with a 4B Qwen 3.5 model in Ollama (thinking off,
temperature 0.3, the Clean polish style): nine dictations, three runs each.

| Check | Without | With |
|---|---|---|
| Swear words kept | 3 of 6 | 6 of 6 |
| Mixed Cantonese and English kept (not translated to English) | 0 of 6 | 6 of 6 |
| Written as Cantonese, not Mandarin or formal Chinese | often wrong | always right |
| Fillers removed (嗯, 呃, um) | 0 of 9 | 9 of 9 |
| Self-corrections applied | 8 of 9 | 9 of 9 |

A one-line version ("mix of Traditional Chinese and English terms") was not enough. Stock Qwen 3
and 3.5 refuse some Cantonese swear words whatever the prompt says.

This merged preset has not been re-tested as a whole yet; results for polish and for
translation are welcome here.
