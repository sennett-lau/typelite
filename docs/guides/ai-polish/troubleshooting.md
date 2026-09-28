# AI polish troubleshooting

## Test fails

| Problem | What to check |
|---|---|
| Cannot connect | The server is running, and the address and port are right. For a server on another computer, it listens on the network (for Ollama `OLLAMA_HOST=0.0.0.0:11434`) and the firewall allows the port. |
| HTTP 401 | The API key is correct and has billing or credit. |
| HTTP 404 | The address ends with `/v1` (or the service's base path), and the model name is exactly what the server lists. For Ollama, pull the model first. |
| Replace `<computer-ip>` … | The address still holds a placeholder; enter the other computer's address. |
| Built-in: server missing | You built Typelite without `llama-server`; see [Built-in](built-in.md#building-typelite-yourself). |
| Built-in: first start is slow | The first start after installing or updating takes a minute or two while macOS prepares the GPU code. |

## Slow or empty answers: check thinking first

If polish is slow, especially oddly slow for a short sentence, first check that the model's
thinking (reasoning) is off. A thinking model reasons step by step before it answers: polish needs
none of that, and it can spend many seconds on it, or use up its token limit and return empty text.

Signs of a thinking model:

- Test passes, but polish takes several seconds even for one short sentence.
- Polish returns nothing, or the log (`~/Library/Logs/Typelite/typelite.log`) says the content was
  empty and reasoning text was used instead.
- The model's name has "thinking" or "reasoning" in it, or it thinks by default (Qwen3 base
  models, Qwen3.5, DeepSeek-R1 and others).

Use an instruct (non-thinking) model, or turn thinking off: see
[AI polish models → Turn off thinking](../models/ai-polish.md#turn-off-thinking) for each server.
Built-in always runs with thinking off.

## Still slow

If thinking is off:

- A server on another computer may unload the model when idle; for Ollama set
  `OLLAMA_KEEP_ALIVE=-1`.
- The first request after a start processes the long polish instructions once; later requests
  are faster if the server caches prompts.
- A large model on a small computer is slow; see [Choosing models](../models/ai-polish.md) and
  [Benchmarks](../benchmarks/README.md).

## The text changes too much, or not enough

- Small models sometimes rephrase more than you want or miss a correction. A 4B instruct model is
  a good balance; a larger model follows the rules more closely.
- For a language other than English, set up its language instructions; see
  [Languages](../languages/README.md).

## Still stuck

Check `~/Library/Logs/Typelite/typelite.log` (timings and errors, never your text) and attach it to
an issue; see [Reporting bugs](../../../CONTRIBUTING.md#reporting-bugs).
