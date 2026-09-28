# AI polish speed

How long one polish request takes, from sending it to receiving the full answer.

## Results

Median seconds. "Cache miss" is the short transcript with the prompt processed from scratch.

| Hardware | Server | Model | Reached | Short English | Long English | Cache miss, short |
|---|---|---|---|---|---|---|
| NVIDIA RTX 3080 Ti, 12 GB | llama-server b11205, CUDA, `--reasoning off` | Huihui-Qwen3.5-4B-abliterated Q4_K_M | local network | 0.13 | 1.02 | 0.52 |

## Data

| File | What it is |
|---|---|
| [`polish-system-prompt.txt`](data/polish-system-prompt.txt) | Typelite's polish prompt with default settings (about 8,000 characters). A test keeps it identical to the app's. |
| [`polish-short-en.txt`](data/polish-short-en.txt) | 14 words with a filler and a self-correction ("3 no actually 4 pm"). |
| [`polish-long-en.txt`](data/polish-long-en.txt) | A 166-word spoken project update with fillers and a correction at the end. |

## Method

`node scripts/benchmark.mjs polish --address <address> --model <model>` does all of this:

- **Requests:** OpenAI-compatible `POST <address>/chat/completions` with the prompt as the system
  message and the transcript as the user message, not streamed, `temperature: 0`,
  `max_tokens: 512`. This is what every dictation sends.
- **Runs:** per transcript one warm-up, then 5 timed requests with the prompt cached; the median,
  measured by the client.
- **Cache miss:** 3 requests whose prompt starts with a different first line, so the whole prompt
  is processed again; the median.

Write down the hardware, the server and its version and flags, the model file and quantisation,
and whether it was reached on the same computer or over the network. Turn thinking off: a
thinking model measures its reasoning, not polish.

## Reading the numbers

- **Prompt caching matters.** Typelite sends the same prompt every time, so after the first
  request most of it comes from the server's cache. A server that does not cache prompts behaves
  like the cache-miss column.
- **Output length dominates** once the prompt is cached: the long transcript takes longer.
- **Network times** include the round trip.
