# OpenAI-compatible speech servers

Most speech servers and cloud services accept the OpenAI transcription API. Typelite uses it for
every address in **Your server or API key** except a Qwen Cloud address
([Qwen Cloud](qwen-cloud.md)).

## Enter a service

Pick **Use your own server or API key…** in the setup step, or **Your server or API key** in
**Settings → Speech**. Fill in:

| Field | What to enter |
|---|---|
| Address | The service's base address, ending before `/audio/transcriptions`. For OpenAI that is `https://api.openai.com/v1`. |
| Model | The model name the service expects, for example `whisper-1` or `large-v3-turbo`. |
| API key | Required by cloud services; leave it empty for your own server. |

Press **Test**, then **Save**. The key is stored in the macOS Keychain and only sent to that
address. See [Speech recognition](README.md#services) for addresses and models of known services.
The spoken language is set separately, under **Settings → Speech → Language**.

## The protocol

When a recording ends, Typelite sends it as one request:

```
POST <address>/audio/transcriptions
Authorization: Bearer <API key>          (only when a key is set)
Content-Type: multipart/form-data

file      recording.wav (16 kHz, 16-bit, mono WAV)
model     <model>
language  <code>                          (only when not auto-detect)
```

and expects a JSON answer with the text:

```json
{"text": "Let's meet at four tomorrow."}
```

- A request times out after 60 seconds. Server errors (5xx) and timeouts are retried up to two
  times.
- Silence is not sent: the recording must hold at least 200 ms of voice (see
  [Built-in → No speech, no text](built-in.md#no-speech-no-text)).
- Test sends 0.1 s of silence and passes on any successful (2xx) answer; silence usually comes
  back as empty text.

## What the address looks like

- It ends before `/audio/transcriptions`; Typelite adds that part.
- A server on another computer uses that computer's address, for example
  `http://192.168.1.20:8000/v1`, or its name on a private network such as Tailscale.
- `http://` is fine on your own network; cloud services use `https://`.

## Running your own server

### whisper.cpp on your computer (macOS)

Needs [Homebrew](https://brew.sh). From a copy of this repository:

```sh
bash scripts/setup-local-whisper.sh
```

The script installs whisper.cpp from Homebrew, downloads the `large-v3-turbo` model from the
official whisper.cpp Hugging Face repository, checks its SHA-256, starts the server as a login
item and runs a test. Use address `http://127.0.0.1:8178/v1` and model `large-v3-turbo`.

Options: `PORT=9000 bash …` for another port, `HOST=0.0.0.0 bash …` to share it with other
computers on your network, `MODEL=small-q5_1 bash …` for the smaller model,
`bash scripts/setup-local-whisper.sh --uninstall` to remove it.

<details>
<summary>Manual steps (what the script does)</summary>

```sh
brew install whisper-cpp
mkdir -p ~/.local/share/whisper
curl -L -o ~/.local/share/whisper/ggml-large-v3-turbo-q5_0.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
shasum -a 256 ~/.local/share/whisper/ggml-large-v3-turbo-q5_0.bin
# expect 394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2
whisper-server -m ~/.local/share/whisper/ggml-large-v3-turbo-q5_0.bin \
  --host 127.0.0.1 --port 8178 --inference-path /v1/audio/transcriptions -l auto -bo 1 -bs 1
```
</details>

With Built-in available, a separate whisper.cpp server on the same computer is rarely needed; it
is useful to share one server with several computers.

### A GPU computer on your network

A computer with an NVIDIA GPU recognises speech several times faster than a laptop. Run
[Speaches](services/speaches.md) with Docker, or build whisper.cpp with CUDA and start
`whisper-server` with `--host 0.0.0.0`. Then use `http://<that-computer's-address>:<port>/v1`.

- Allow the port through that computer's firewall, for your local network only. On Windows,
  check that no automatic "block" rule was created for the server the first time it ran.
- Across networks, use a private network such as Tailscale instead of opening the port to the
  internet.
