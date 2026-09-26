---
id: lm-studio
name: LM Studio
connection: openai-compatible
address: http://127.0.0.1:1234/v1
model: qwen3-4b-instruct-2507
needs_key: false
runs: on-device
cost: free
notes: Use the model identifier LM Studio shows for the loaded model.
thinking_off: Pick a non-thinking (instruct) model.
---

Install [LM Studio](https://lmstudio.ai/), download a small instruct model, then start its local
server (the **Developer** tab). Enter the address above and the model identifier LM Studio shows.
It can also serve other computers on your network; use that computer's address then.

See [Choosing a model](../../models.md) for model suggestions and for turning off thinking.
