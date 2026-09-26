---
id: llama-cpp-server
name: llama.cpp server
connection: openai-compatible
address: http://127.0.0.1:8080/v1
model: any (the loaded model is used)
needs_key: false
runs: on-device
cost: free
notes: Useful to run your own GGUF model, here or on another computer.
thinking_off: Start it with --reasoning off.
---

[llama.cpp](https://github.com/ggml-org/llama.cpp)'s `llama-server` serves one GGUF model behind
the OpenAI API. This is what Typelite's Built-in AI runs for you; start it yourself to use another
model or another computer:

```sh
llama-server -m Qwen3-4B-Instruct-2507-Q4_K_M.gguf --host 127.0.0.1 --port 8080 --reasoning off
```

Use `--host 0.0.0.0` to serve other computers on your network, and set `--api-key` if you do.
See [Choosing a model](../../models.md#turn-off-thinking).
