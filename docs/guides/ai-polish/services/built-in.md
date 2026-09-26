---
id: built-in
name: Built-in (llama-server)
connection: builtin
address: none
model: Qwen3 4B Instruct 2507 or Qwen3 1.7B
needs_key: false
runs: on-device
cost: free
languages: Many languages; best in English and Chinese
notes: One click in Typelite on Apple Silicon; text never leaves your computer.
thinking_off: Always off; nothing to set.
---

Pick **Built-in** in the AI setup step or in **Settings → AI**, choose a model and press
**Set up**. Typelite downloads the model, checks it, starts llama.cpp's `llama-server` and sends a
test request. Details: [Built-in AI polish](../built-in.md).
