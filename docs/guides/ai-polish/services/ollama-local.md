---
id: ollama-local
name: Ollama on your computer
connection: openai-compatible
address: http://127.0.0.1:11434/v1
model: qwen3:4b-instruct-2507-q4_K_M
needs_key: false
runs: on-device
cost: free
notes: About 3 GB of memory for the 4B model.
thinking_off: Extra fields {"reasoning_effort":"none"}
---

Install Ollama from [ollama.com](https://ollama.com) (on macOS also `brew install ollama`), start
it, and pull a model:

```sh
ollama pull qwen3:4b-instruct-2507-q4_K_M
```

The model above does not think. For a model that does, add the extra field shown above under
**Advanced**; see [Choosing a model](../../models.md#turn-off-thinking).
