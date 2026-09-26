---
id: groq
name: Groq
connection: openai-compatible
address: https://api.groq.com/openai/v1
model: llama-3.1-8b-instant
needs_key: true
runs: cloud
cost: free-tier
notes: Free daily allowance.
thinking_off: For Qwen3 models, Extra fields {"reasoning_effort":"none"}
---

1. Sign in at [console.groq.com](https://console.groq.com).
2. Open **API Keys**, choose **Create API Key**, and paste it into Typelite.

Your text is sent to Groq. The model above does not think; for Groq's Qwen3 models add the extra
field shown above under **Advanced** (see [Choosing a model](../../models.md#turn-off-thinking)).
