---
id: localai
name: LocalAI
connection: openai-compatible
address: http://127.0.0.1:8080/v1
model: whisper-1
needs_key: false
runs: on-device
cost: free
notes: Use the name of the Whisper model you installed in LocalAI.
---

[LocalAI](https://localai.io/) serves many kinds of models behind the OpenAI API, including
Whisper for `/audio/transcriptions`. Install a Whisper model in LocalAI and enter its name as
the model. It can also run on another computer; use that computer's address.
