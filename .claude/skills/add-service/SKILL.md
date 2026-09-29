---
name: add-service
description: Add a speech recognition or AI polish service (a server or a cloud API) to Typelite's guides, in the Services row and server-section format the docs check enforces. Use when someone wants to document a service that already works with Typelite.
---

# Add a service to the guides

The format is in [CONTRIBUTING.md → Docs formats](../../../CONTRIBUTING.md#docs-formats) and
[Adding a service](../../../CONTRIBUTING.md#adding-a-service). Read both first; this skill only
says how to apply them.

1. **Ask** (skip what the user already said): the step (speech or AI polish), the service name and
   project link, where it runs, cost, whether it needs a key, an example address and model, and
   whether it was tested in Typelite. Do not add a service nobody has tested with the current app.
2. **Check it fits an existing connection.** Speech: Built-in, OpenAI-compatible
   (`POST <address>/audio/transcriptions`), Qwen Cloud or ElevenLabs. AI polish: Built-in or
   OpenAI-compatible (`POST <address>/chat/completions`). If it needs its own protocol, stop: that
   is a [new connection](../../../CONTRIBUTING.md#new-connections) and needs a plan.
3. **Add the row** to the Services table in `docs/guides/<step>/README.md`, in the column format,
   keeping the order Built-in → servers you run → cloud.
4. **Add its setup:**
   - a server you run: a `###` server section under **Running your own server** in
     `docs/guides/<step>/openai-compatible.md` (what it is, command block, "Use address … and
     model …", notes), and link the row to its anchor;
   - a cloud service: a line in that page's **Cloud services** table (where to get a key, billing),
     and link the row to `openai-compatible.md#cloud-services`.
   - AI polish: if the model can think, say how to turn it off, and add the server to the
     **Turn off thinking** table in `docs/guides/models/ai-polish.md` if it is new there.
5. **Check:** `npm run docs:check` must pass. Show the user the diff; do not commit unless asked.

Never write private addresses, machine names or keys; use `<computer-address>`.
