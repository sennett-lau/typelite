---
id: openrouter
name: OpenRouter
connection: openai-compatible
address: https://openrouter.ai/api/v1
model: qwen/qwen3-4b-instruct-2507
needs_key: true
runs: cloud
cost: paid
notes: Many chat models from many providers behind one key; some are free.
thinking_off: Pick a non-thinking (instruct) model.
---

1. Sign in at [openrouter.ai](https://openrouter.ai).
2. Create a key under **Keys** and paste it into Typelite.
3. Use any chat model it lists; the model id is shown on each model's page.

Your text is sent to OpenRouter and the provider that runs the model. See
[Choosing a model](../../models.md).
