# OpenAI-compatible chat servers

Ollama, LM Studio, llama.cpp and most cloud services accept the OpenAI chat API. Typelite uses it
for every AI preset except Built-in.

## Enter a service

Pick **Use your own server or API key…** in the AI setup step, or **Your server or API key** in
**Settings → AI**. Fill in:

| Field | What to enter |
|---|---|
| Address | The service's base address, ending before `/chat/completions`, for example `http://127.0.0.1:11434/v1`. |
| Model | The model name the service expects. |
| API key | Required by cloud services; optional for your own server. |
| Advanced → Extra fields | Optional JSON added to every request, for example `{"reasoning_effort": "none"}`. |

Press **Test**, then **Save**. The key is stored in the macOS Keychain and only sent to that
address. See [AI polish](README.md#services) for addresses and models of known services.

## The protocol

```
POST <address>/chat/completions
Authorization: Bearer <API key>          (only when a key is set)
Content-Type: application/json

{"model": "<model>",
 "messages": [{"role": "system", "content": "…polish instructions…"},
              {"role": "user", "content": "…transcript…"}],
 "stream": true or false,
 "max_tokens": …,
 "temperature": …,
 …your extra fields…}
```

- An address that already ends in `/chat/completions` is used as it is.
- The answer is read from `choices[0].delta.content` (streaming) or `choices[0].message.content`.
  A server that puts the whole answer in `reasoning_content` still works, but see
  [Thinking models](thinking-models.md).
- **Extra fields** are copied into the body last, so they replace the defaults: for example
  `{"temperature": 0.7}` changes the temperature.
- A request times out after 60 seconds. Server errors (5xx) are retried up to two times before
  the answer starts.
- The system prompt is the same for every dictation (it changes only with your settings), so a
  server with a prompt cache answers much faster after the first request. See
  [Benchmarks](../benchmarks.md).

## Running your own server

- **Ollama** on your computer or another one: see the
  [Ollama on your computer](services/ollama-local.md) and
  [Ollama on another computer](services/ollama-network.md) cards.
- **LM Studio**: see [its card](services/lm-studio.md).
- **llama.cpp** `llama-server` with any GGUF model: see [its card](services/llama-cpp-server.md).

For a server on another computer, allow its port through that computer's firewall for your local
network only, and use a private network such as Tailscale across networks.
