---
id: qwen-cloud
name: Qwen Cloud
connection: qwen-cloud
address: https://token-plan.maas.qwencloudapi.com/api/v1
model: qwen-audio-3.0-asr-flash
needs_key: true
runs: cloud
cost: paid
languages: Mixed English, Mandarin and Cantonese
notes: Needs a Token Plan. Recordings up to 4 min 50 s.
---

1. Sign in to the Qwen Cloud console and subscribe to a **Token Plan**.
2. Create an API key and paste it into Typelite with the address above.

Typelite recognises the address and uses Qwen's own speech API. Chinese comes back in
Simplified characters. Details: [Qwen Cloud](../qwen-cloud.md). Your audio is sent to Qwen
Cloud.
