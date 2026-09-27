# Benchmarks

Reference numbers for two common machines, so you can judge what to expect from similar hardware:
AI polish speed, [speech recognition accuracy and speed for Cantonese](#speech-recognition-cantonese)
and Typelite's Built-in models. They are measurements, not a recommendation: pick the setup that
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

## Speech recognition: Cantonese

How well speech models keep Cantonese as it was spoken, and how fast they are on the GPU machine
above (RTX 3080 Ti).

### Method

- **Clips:** 11 Cantonese recordings and 1 English one, made with the macOS Cantonese voice (Sinji)
  from known text: ten everyday sentences with fillers, self-corrections, English words and a
  swear word, plus one 13-second sentence with heavy code-mixing ("我一直都keep住試緊廣東話…").
- **Requests:** Typelite's own request (`POST <address>/audio/transcriptions`, 16 kHz mono WAV,
  auto-detect). Each clip 3 times after a warm-up; times are medians.
- **Scores:** character error rate against the known text (punctuation and spaces ignored), how
  many of 50 Cantonese words (我哋, 聽日, 咗, 緊, 咯…) and 18 English words survived, and whether
  Simplified characters appeared.

### Results

| Model and server | Error rate | Cantonese words kept | English words kept | Script | Time, short clip | Time, 13-s clip |
|---|---|---|---|---|---|---|
| whisper large-v3-turbo q5_0, whisper.cpp with CUDA | 43.8% | 2 of 50 | 7 of 18 | Traditional, formal written Chinese | 0.17 s | – |
| Qwen3-ASR-1.7B, vLLM, raw output | 24.3% | 32 of 50 | 18 of 18 | Simplified | 0.14 s | 0.37 s |
| Qwen3-ASR-1.7B, vLLM, in Hong Kong characters (as Typelite writes it) | **2.4%** | **49 of 50** | **18 of 18** | Hong Kong Traditional | 0.2–0.3 s over the network | 0.6 s over the network |
| Qwen3-ASR-1.7B Q8_0, llama.cpp `llama-server` with CUDA | same text as vLLM | | | Simplified (converted by Typelite) | **0.10 s** | **0.27 s** |
| Qwen3-ASR-1.7B Q8_0, llama.cpp `llama-server` (on the Apple machine), in Hong Kong characters | **2.4%** | **49 of 50** | **18 of 18** | Hong Kong Traditional | 0.45 s | 1.7 s |
| alvanlii/whisper-small-cantonese, whisper.cpp (on the Apple machine) | 30.2% | 40 of 50 | 9 of 18 | Traditional, colloquial | 0.45 s | 0.79 s |

- whisper wrote the 13-second sentence as "我一直都記住試廣東話，但出來的效果好像不是這樣…";
  Qwen3-ASR wrote it exactly as spoken.
- Qwen3-ASR's raw error rate is high mostly because of its Simplified characters (听日 for 聽日);
  the words themselves were right. Typelite converts them to the characters of your Chinese
  language.
- The Cantonese whisper-small model writes colloquial Cantonese, but it added stray words ("laa",
  "對啊") to most clips, dropped one clip entirely and could not transcribe the English clip.
- VRAM: Qwen3-ASR-1.7B used about 3.4 GB with llama.cpp (Q8_0, `-c 4096 -np 1`) and about 6.8 GB
  with vLLM (`--gpu-memory-utilization 0.55`, 3.9 GB of it weights). whisper large-v3-turbo used
  about 1.2 GB.
- The same model gives the same text on vLLM and on llama.cpp (Q8_0); llama.cpp on the Apple
  machine needed `-c 4096 -np 1`, as its default context ran the GPU out of memory.

For comparison, the Qwen team's published results (error rate, lower is better) on Cantonese:
Fleurs 3.98 against whisper large-v3's 9.18, WenetSpeech-Yue 5.82 against 32.26, and Cantonese
dialogue 4.12 against 31.04 ([Qwen3-ASR technical report](https://arxiv.org/abs/2601.21337)).

### Caveats

- **Synthetic speech.** A text-to-speech voice is clearer than real speech, and it mispronounced a
  few words (book → 讀); real recordings will score worse for every model. Test with your own voice.
- **A small set.** Twelve clips show large differences reliably, not small ones.
- **Timing.** whisper was timed from another computer over the local network; Qwen3-ASR on vLLM
  and on llama.cpp with CUDA was timed on the GPU machine itself; add about 0.1–0.2 s over the
  network.

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
