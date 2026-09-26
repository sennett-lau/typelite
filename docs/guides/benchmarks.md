# Benchmarks

Reference numbers for two common machines running the same AI polish model, so you can judge what
to expect from similar hardware. They are measurements, not a recommendation: pick the setup that
fits your privacy, cost and speed needs.

## AI polish: reference numbers for two common machines

| | GPU machine | Apple Silicon machine |
|---|---|---|
| Hardware | NVIDIA GeForce RTX 3080 Ti (12 GB VRAM) | Apple M1 Pro (14-core GPU, 32 GB unified memory) |
| Server | [Ollama](https://ollama.com/) 0.34.3 with CUDA, NVIDIA driver 610.88 | llama.cpp `llama-server` (build 7fe450e19) with Metal, flash attention on |
| Reached over | the local network (Wi-Fi / Ethernet round trip included) | the same computer (127.0.0.1) |
| Model | Qwen3-4B-Instruct-2507, Q4_K_M (2.3 GiB) | the same file format and quantisation |

### Method

- **Prompt:** Typelite's real polish system prompt, about 1,350 tokens, plus the transcript as the
  user message. This is what every dictation sends.
- **Requests:** OpenAI-compatible `POST /v1/chat/completions`, not streamed, `temperature: 0`,
  `max_tokens: 512`.
- **Runs:** one warm-up request per input, then 5 timed runs. The tables give the **median** total
  time, measured by the client from sending the request to receiving the full answer.
- **Inputs:** five raw transcripts with fillers and self-corrections:

| Input | Example of what it is | Output tokens |
|---|---|---|
| Short English | one sentence with a self-correction ("at 3, no actually 4 pm") | 16 |
| Long English | a 150-word spoken project update | about 147 |
| Cantonese | one colloquial Cantonese sentence | 40–44 |
| Mixed | Cantonese with English words ("present個proposal") | 28 |
| Mandarin | one Mandarin sentence with a self-correction | 25 |

### Median total time, prompt cached

Both servers keep the system prompt's processed tokens from the previous request (the prompt
cache), so only the transcript is new.

| Input | GPU machine (over the network) | Apple Silicon machine |
|---|---|---|
| Short English | 0.11 s | 0.43 s |
| Long English | 0.82 s | 8.9 s |
| Cantonese | 0.27 s | 2.1 s |
| Mixed | 0.18 s | 1.4 s |
| Mandarin | 0.16 s | 1.3 s |

With streaming, the first token arrived after 0.04–0.08 s on both machines.

### Prompt cache hit versus miss

To force a cache miss, each request started the system prompt with a different first line, so the
whole ~1,350-token prompt had to be processed again (3 runs, median).

| Input | GPU machine, hit → miss | Apple Silicon machine, hit → miss |
|---|---|---|
| Short English | 0.11 s → 0.55 s | 0.43 s → 8.6 s |
| Cantonese | 0.27 s → 0.49 s | 2.1 s → 9.4 s |

Prompt processing is where the two machines differ most. Typelite sends the same system prompt
every time, so after the first request of a session most of it comes from the cache. Changing
settings that alter the prompt (for example your dictionary, or the language notes it includes)
causes one slower request.

### Apple Silicon: cold start, memory and speed

- **Server start:** the model loaded in about 3 s.
- **First request after start:** 4.4 s, almost all of it processing the 1,346-token prompt for the
  first time (about 340 tokens/s); later requests reuse it from the cache.
- **Memory:** the 2.3 GiB of model weights plus the context cache, roughly 3 GB while the server
  runs.
- **Speed without other load** (`llama-bench`, same model): prompt processing about 230 tokens/s
  for a 1,350-token prompt, generation about 25 tokens/s.
- **Speed in the runs above:** generation between about 17 and 38 tokens/s, lower for longer
  answers.

### GPU machine: speed

Ollama's OpenAI-compatible endpoint does not report timings. From the client side, the long
English answer (146 tokens) took 0.82 s in total including the network round trip, which puts
generation well above 150 tokens/s.

### Caveats

- **The Apple machine was not idle.** Other apps were using its GPU during the test, so its numbers
  are pessimistic; the idle `llama-bench` numbers above are a better guide to its peak.
- **GPU-machine times include the local network.** A slower or busier network adds to every
  request.
- **Prompt caching matters.** The cached and uncached rows show how much. A server that does not
  cache prompts, or that serves many users, behaves like the "miss" column.
- **Results vary** with the model, the quantisation, the server and driver versions, the context
  size and the operating system. Treat these as a rough reference.
- **Output length dominates** once the prompt is cached: the long English answer is slow on the
  Apple machine because it generates ~150 tokens.

## Built-in models on Apple Silicon

Typelite's Built-in options run on the computer itself (see
[AI polish → Built-in](ai-polish/built-in.md) and [Speech → Built-in](speech/built-in.md)).
Approximate numbers measured on an Apple M1 Pro:

| What | Model | Time |
|---|---|---|
| AI polish server start | Qwen3 4B Instruct 2507 or Qwen3 1.7B, Q4_K_M | about 4 s (after the first launch, which prepares the GPU code once and takes one to two minutes) |
| AI polish, warm, one dictation | Qwen3 4B Instruct 2507 or Qwen3 1.7B, Q4_K_M | about 0.4–1.8 s, depending on length |
| Speech recognition, short clip | whisper large-v3-turbo (q5_0) | about 2.1–2.4 s |

The speech numbers are approximate and come from Typelite's own timing log
(`[Pipeline Timing]` lines in `~/Library/Logs/Typelite/typelite.log`) for clips of a few seconds.

## How to run your own benchmark

1. **Use the real prompt.** Typelite's polish prompt is long (about 1,350 tokens), which is what
   makes prompt processing and caching matter. A benchmark with a one-line prompt will look much
   faster than real use.
2. **Pick a few inputs** that match how you dictate: a short sentence, a long paragraph, and each
   language you use. Include fillers and a self-correction.
3. **Send OpenAI-compatible chat requests** to your server (`POST <address>/chat/completions`) with
   the system prompt, the transcript as the user message, `temperature: 0` and streaming off.
4. **Warm up once, then time 5 runs** per input from the client, and report the median. Note the
   output token count (`usage.completion_tokens`); longer answers take longer.
5. **Measure a cache miss** by changing the first line of the system prompt on each request.
6. **Measure a cold start** by restarting the server and timing its first request.
7. **Write down** the hardware, the server and its version, the model file and quantisation, the
   context size, and what else was running.

For speech recognition, the **Insights** panel on Typelite's Home page shows the time each step of
your recent dictations took, and the log's `[Pipeline Timing]` lines give the same numbers.
