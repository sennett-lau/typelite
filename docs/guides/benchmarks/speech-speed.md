# Speech recognition speed

How long speech recognition takes for a short clip, from sending the recording to receiving the
text.

## Results

Median seconds.

| Hardware | Server | Model | Reached | Short clip |
|---|---|---|---|---|
| NVIDIA RTX 3080 Ti, 12 GB | llama-server b11205, CUDA | Qwen3-ASR-1.7B Q8_0 | local network | 0.12 |
| Apple M1 Pro, 32 GB | whisper-server (Homebrew whisper-cpp), Metal | whisper large-v3-turbo q5_0 | same computer | 3.95 |

## Data

| File | What it is |
|---|---|
| [`speech-short-en.txt`](data/speech-short-en.txt) | The sentence the clip says (about 4 s). |

The clip is made from that sentence with the macOS voice Samantha, as Typelite records it (16 kHz,
16-bit, mono WAV). On a Mac the script makes it for you; elsewhere, record the sentence yourself
and pass it with `--wav <file>`, and say so in a note.

## Method

`node scripts/benchmark.mjs speech --address <address> --model <model>` sends Typelite's own
request, `POST <address>/audio/transcriptions` with the WAV, one warm-up and then 5 timed
requests, and prints the median.
