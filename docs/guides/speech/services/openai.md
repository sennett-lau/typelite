---
id: openai
name: OpenAI
connection: openai-compatible
address: https://api.openai.com/v1
model: whisper-1
needs_key: true
runs: cloud
cost: paid
notes: gpt-4o-transcribe also works. Billed per minute of audio.
---

1. Sign in at [platform.openai.com](https://platform.openai.com).
2. Add a payment method under **Billing**.
3. Open **API keys**, choose **Create new secret key**, and paste it into Typelite.

Your audio is sent to OpenAI.
