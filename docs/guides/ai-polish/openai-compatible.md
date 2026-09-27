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

For a server on another computer, allow its port through that computer's firewall for your local
network only, and use a private network such as Tailscale across networks. For a model that
thinks, see [Turn off thinking](../models/ai-polish.md#turn-off-thinking).

### Ollama

Install Ollama from [ollama.com](https://ollama.com) (on macOS also `brew install ollama`), start
it, and pull a model:

```sh
ollama pull qwen3:4b-instruct-2507-q4_K_M
```

Use address `http://127.0.0.1:11434/v1` and that model name. About 3 GB of memory for the 4B model.

**On another computer**, for example one with an NVIDIA GPU, make Ollama listen on the network and
keep the model loaded, then use `http://<that-computer's-address>:11434/v1`:

| Setting | macOS / Linux | Windows |
|---|---|---|
| Listen on the network | `OLLAMA_HOST=0.0.0.0:11434` | Set it as a user environment variable, then restart Ollama |
| Keep the model loaded | `OLLAMA_KEEP_ALIVE=-1` | same |

On Windows, check that no automatic "block" firewall rule was created for `ollama.exe` the first
time it ran.

### llama.cpp server

[llama.cpp](https://github.com/ggml-org/llama.cpp)'s `llama-server` serves one GGUF model behind
the OpenAI API. It is what Built-in runs for you; start it yourself to use another model or
another computer:

```sh
llama-server -m Qwen3-4B-Instruct-2507-Q4_K_M.gguf --host 127.0.0.1 --port 8080 --reasoning off
```

Use address `http://127.0.0.1:8080/v1`; any model name works (the loaded model is used). Use
`--host 0.0.0.0` to serve other computers, and set `--api-key` if you do.

### LM Studio

Install [LM Studio](https://lmstudio.ai/), download a small instruct model, and start its local
server (the **Developer** tab). Use address `http://127.0.0.1:1234/v1` and the model identifier LM
Studio shows. It can also serve other computers on your network.

## Cloud services

Each needs your own API key, and your text is sent to that service. Enter the address and model
from [AI polish → Services](README.md#services).

| Service | Getting a key |
|---|---|
| Groq | Sign in at [console.groq.com](https://console.groq.com), open **API Keys**, **Create API Key**. Free daily allowance. For Groq's Qwen3 models add Extra fields `{"reasoning_effort": "none"}`. |
| OpenAI | Sign in at [platform.openai.com](https://platform.openai.com), add a payment method under **Billing**, then **API keys** → **Create new secret key**. Billed per token. |
| OpenRouter | Sign in at [openrouter.ai](https://openrouter.ai) and create a key under **Keys**. The model id is shown on each model's page; your text also goes to the provider that runs it. |
