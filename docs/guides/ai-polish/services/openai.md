---
id: openai
name: OpenAI
connection: openai-compatible
address: https://api.openai.com/v1
model: gpt-4.1-mini
needs_key: true
runs: cloud
cost: paid
notes: Billed per token.
thinking_off: gpt-4.1-mini does not think; for reasoning models see Choosing a model.
---

1. Sign in at [platform.openai.com](https://platform.openai.com).
2. Add a payment method under **Billing**.
3. Open **API keys**, choose **Create new secret key**, and paste it into Typelite.

Your text is sent to OpenAI. For reasoning models, see
[Choosing a model](../../models.md#turn-off-thinking).
