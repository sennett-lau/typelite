---
id: whisper-cpp-server
name: whisper.cpp server
connection: openai-compatible
address: http://127.0.0.1:8178/v1
model: large-v3-turbo
needs_key: false
runs: on-device
cost: free
languages: About 100 languages, auto-detect
notes: Can also run on another computer (start it with --host 0.0.0.0).
---

The whisper.cpp project's own HTTP server. On macOS, `scripts/setup-local-whisper.sh` installs
it with Homebrew, downloads and checks the model, and starts it as a login item. On Linux or
Windows, build whisper.cpp and start `whisper-server` with
`--inference-path /v1/audio/transcriptions`. See
[Running your own server](../openai-compatible.md#running-your-own-server).
