---
id: ollama-network
name: Ollama on another computer
connection: openai-compatible
address: http://<computer-address>:11434/v1
model: qwen3:4b-instruct-2507-q4_K_M
needs_key: false
runs: local-network
cost: free
notes: Fast on a computer with an NVIDIA GPU. Set OLLAMA_HOST=0.0.0.0:11434 there.
thinking_off: Extra fields {"reasoning_effort":"none"}
---

On that computer, install Ollama from [ollama.com](https://ollama.com), make it listen on the
network and keep the model loaded:

| Setting | macOS / Linux | Windows |
|---|---|---|
| Listen on the network | `OLLAMA_HOST=0.0.0.0:11434` | Set it as a user environment variable, then restart Ollama |
| Keep the model loaded | `OLLAMA_KEEP_ALIVE=-1` | same |

```sh
ollama pull qwen3:4b-instruct-2507-q4_K_M
```

Replace `<computer-address>` with that computer's address.

- Allow port 11434 through the firewall for your local network only. On Windows, check that no
  automatic "block" rule was created for `ollama.exe` the first time it ran.
- Across networks, use a private network such as Tailscale.
- For a model that thinks, see [Choosing a model](../../models.md#turn-off-thinking).
