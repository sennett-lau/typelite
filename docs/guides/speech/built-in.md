# Built-in speech recognition

Built-in runs [whisper.cpp](https://github.com/ggml-org/whisper.cpp) inside Typelite. No server,
no account, no key: your audio never leaves your computer.

## Set it up

Pick **Built-in** in the speech setup step, or in **Settings → Speech**, choose a model and press
**Set up** (or **Download** in Settings). Typelite downloads the model, checks its SHA-256 and
loads it. A download that breaks off resumes where it stopped.

## Models

| Model | File | Size | Offered on |
|---|---|---|---|
| Best accuracy | whisper large-v3-turbo, q5_0 (`ggml-large-v3-turbo-q5_0.bin`) | 574 MB | Apple Silicon with 8 GB of memory or more |
| Faster | whisper small, q5_1 (`ggml-small-q5_1.bin`) | 190 MB | Every Mac |

- The models come from the official whisper.cpp repository on Hugging Face. They are stored in
  `~/Library/Application Support/dev.typelite.mac/models/`.
- Typelite checks the chip, the memory and the free disk space (1.1 × the model size) and offers
  only the models that suit your computer. With both offered, Best accuracy is selected.
- **Delete** in Settings removes a model file.

## Hardware notes

- On Apple Silicon, whisper.cpp uses the GPU through Metal. On an M1 Pro a short clip takes
  about 2 seconds with large-v3-turbo (see [Benchmarks](../benchmarks.md)); newer chips are
  faster.
- Intel Macs have no GPU that whisper.cpp uses well, so they get only the small model. A GPU
  computer on your network or a cloud service is much faster there; see
  [OpenAI-compatible](openai-compatible.md).
- The model loads when a recording starts (while you speak), stays in memory, and is freed
  after 10 minutes without use.

## Languages

Leave **Settings → Speech → Spoken language** on auto-detect to have whisper detect it; it handles mixed English, Mandarin and
Cantonese (Cantonese comes out as standard written Chinese). A fixed language saves the detection
pass and can help a short clip. See [Languages](../languages.md).

## No speech, no text

Before recognition, Typelite checks that the recording holds at least 200 ms of voice, so a key
click or a bump of the microphone is not sent. After recognition it drops segments whisper itself
marks as probably not speech, and a lone "Thank you." from a very short clip. The pill then shows
"Didn't catch that" and nothing is pasted.
