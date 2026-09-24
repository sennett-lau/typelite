# Speech and AI

STT and LLM backends, prompts and latency. Back to [index](index.md).

## Speech-to-text

- **First backend:** the whisper.cpp server already running on the Mac
  (`http://127.0.0.1:8178/v1/audio/transcriptions`, model large-v3-turbo q5_0, `-l auto`).
  The app sends a 16 kHz mono WAV and reads `{"text": ...}`. About 2 s for a short clip.
- **Auto language detection** is a must: the user mixes English, Cantonese and Mandarin.
  Cantonese comes back as standard written Chinese, which is accepted.
- **Later:** WhisperKit in-process (MIT, Neural Engine), with no server process to manage.
  Apple's SpeechAnalyzer (macOS 26) is a possible extra option, but it needs a fixed locale.
- **Considered:** Parakeet is very fast but covers only 25 European languages, with no Chinese.

## LLM

- Ollama on sennett-pc over Tailscale (`http://100.90.208.26:11434/v1`),
  model `qwen3:4b-instruct-2507-q4_K_M`, kept loaded. About 0.15 s per cleanup when warm.
- OpenAI-compatible `/chat/completions`, `temperature` low (about 0.2), short `max_tokens`.
- Use non-thinking models only. Qwen3.5 thinks by default and returns empty text without a
  thinking-off flag.

## Prompts (one per mode)

- **Dictate:** remove fillers, apply self-corrections ("Monday, no wait, Tuesday" → Tuesday),
  fix grammar and punctuation, keep the meaning, keep the language, output only the text.
- **Ask:** answer briefly and directly.
- **Translate:** translate into the target language, output only the translation.

The transcript is passed as data, never as instructions, so dictated words cannot change what
the model is asked to do.

## Latency budget (stop speaking → text appears)

| Step | Budget |
|---|---|
| Finish recording, encode WAV | < 50 ms |
| Transcribe | ≤ 1.5 s |
| Polish | ≤ 0.5 s |
| Paste | < 100 ms |

## Fallbacks

- PC unreachable or LLM slower than about 3 s: paste the raw transcript.
- whisper-server down: show an error and keep the audio for retry.
