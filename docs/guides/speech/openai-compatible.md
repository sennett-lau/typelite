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

file             recording.wav (16 kHz, 16-bit, mono WAV)
model            <model>
language         <code>                   (only with a fixed language)
response_format  verbose_json             (only with auto-detect)
```

and expects a JSON answer with the text, and with `verbose_json` the language it heard:

```json
{"text": "Let's meet at four tomorrow.", "language": "en"}
```

- The detected language lets Typelite add the right [language instructions](../languages/README.md)
  when it polishes. A server that refuses `verbose_json` gets plain requests for the rest of the
  session and keeps working, without a detected language.

- A request times out after 60 seconds. Server errors (5xx) and timeouts are retried up to two
  times.
- Silence is not sent: the recording must hold at least 200 ms of voice (see
  [Built-in → No speech, no text](built-in.md#no-speech-no-text)).
- Test sends 0.1 s of silence and passes on any successful (2xx) answer; silence usually comes
  back as empty text.

## What the address looks like

- It ends before `/audio/transcriptions`; Typelite adds that part.
- A server on another computer uses that computer's address, for example
  `http://192.0.2.20:8000/v1`, or its name on a private network such as Tailscale.
- `http://` is fine on your own network; cloud services use `https://`.

## Running your own server

### whisper.cpp

On macOS, with [Homebrew](https://brew.sh), from a copy of this repository:

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

On Linux or Windows, build whisper.cpp and start `whisper-server` with
`--inference-path /v1/audio/transcriptions`. With Built-in available, a separate whisper.cpp
server on the same computer is rarely needed; it is useful to share one server with several
computers.

### A GPU computer on your network

A computer with an NVIDIA GPU recognises speech several times faster than a laptop. Run
[Speaches](#speaches) with Docker, or build whisper.cpp with CUDA and start
`whisper-server` with `--host 0.0.0.0`. Then use `http://<that-computer's-address>:<port>/v1`.

- Allow the port through that computer's firewall, for your local network only. On Windows,
  check that no automatic "block" rule was created for the server the first time it ran.
- Across networks, use a private network such as Tailscale instead of opening the port to the
  internet.

### Qwen3-ASR

[Qwen3-ASR](https://huggingface.co/Qwen/Qwen3-ASR-1.7B) (Apache-2.0) is the speech model to use when whisper does not write your
language the way you speak it, for example Cantonese (see the
[language guides](../languages/README.md#language-guides)). It runs on llama.cpp's `llama-server`,
the same C++ runtime family as whisper.cpp, or on vLLM. Both answer Typelite's transcription
request; Typelite then:

- removes the language tag Qwen3-ASR puts in front of the text (`language Cantonese<asr_text>…`)
  and uses it as the detected language for the
  [language router](../languages/README.md#where-the-instructions-are-used);
- writes the text in the characters of the Chinese language the router picks: Qwen3-ASR writes
  Chinese in Simplified characters, so a dictation recognised as Cantonese (Hong Kong) becomes Hong
  Kong Traditional, with Cantonese 係 and 覆.

In Typelite, use address `http://<that-computer's-address>:<port>/v1`, model `qwen3-asr`, no API
key, and leave **Spoken language** on **Auto-detect**.

**With llama.cpp (Mac, NVIDIA or CPU).** Install llama.cpp (on a Mac, `brew install llama.cpp`; on
Windows or Linux, a release from [llama.cpp's releases](https://github.com/ggml-org/llama.cpp/releases),
the CUDA build for an NVIDIA GPU), then:

```sh
llama-server -hf ggml-org/Qwen3-ASR-1.7B-GGUF:Q8_0 --host 127.0.0.1 --port 8180 -c 4096 -np 1
```

- `-hf` downloads the model and its audio encoder (`mmproj`, about 2.5 GB together) on the first
  start. Use `Qwen3-ASR-0.6B-GGUF` for the smaller model.
- `-c 4096 -np 1` keep memory low: dictation needs a short context and one request at a time. The
  defaults reserve far more, and can run a Mac's GPU out of memory.
- A short clip takes about 0.5 s on an M1 Pro, faster than Built-in whisper, and 0.1 s on an RTX
  3080 Ti with the CUDA build, which needs about 3.4 GB of VRAM. On Windows it runs natively, with
  no WSL or Python.

**With vLLM (NVIDIA GPU).** An alternative to llama.cpp for Linux, or WSL2 on Windows. It was a
little slower than llama.cpp in our test and needs about twice the VRAM (about 7 GB for the 1.7B
model).

```sh
python3 -m venv ~/qwen3-asr && source ~/qwen3-asr/bin/activate
pip install "qwen-asr[vllm]"
qwen-asr-serve Qwen/Qwen3-ASR-1.7B --host 0.0.0.0 --port 8180 \
  --gpu-memory-utilization 0.55 --max-model-len 4096 --max-num-seqs 2
```

- Start the model with `qwen-asr-serve`, not `vllm serve`: it registers Qwen3-ASR with vLLM first.
- `--gpu-memory-utilization` is the share of the whole GPU vLLM may use. If vLLM stops with "No
  available memory for the cache blocks", raise it or free GPU memory; 0.55 fits the 1.7B model on
  a 12 GB card next to a 4B polish model.
- **WSL2 on Windows:** a WSL server is reachable only from the Windows computer itself. Forward the
  port with `netsh interface portproxy add v4tov4 listenport=8180 listenaddress=<windows address>
  connectport=8180 connectaddress=127.0.0.1` and allow it through the firewall for your network
  only. Windows stops WSL when nothing is attached to it, which also stops servers inside it: run
  `wsl.exe -d Ubuntu -e sleep infinity` from a logon task, and start the server as a systemd
  service.

Either way, to serve other computers use `--host 0.0.0.0` and allow the port through the firewall
for your local network only.

### Speaches

[Speaches](https://github.com/speaches-ai/speaches) is an OpenAI-compatible server built on
faster-whisper. Run it with Docker on a computer with an NVIDIA GPU:

```sh
docker run -d --name speaches --gpus=all -p 8000:8000 \
  -v hf-hub-cache:/home/ubuntu/.cache/huggingface/hub \
  ghcr.io/speaches-ai/speaches:latest-cuda
```

Use address `http://<that-computer's-address>:8000/v1` and model `Systran/faster-whisper-large-v3`.

### LocalAI

[LocalAI](https://localai.io/) serves many kinds of models behind the OpenAI API, including
Whisper. Install a Whisper model in LocalAI, use address `http://127.0.0.1:8080/v1` (or the
address of the computer it runs on) and the name of that model.

## Cloud services

Each needs your own API key, and your audio is sent to that service. Enter the address and model
from [Speech recognition → Services](README.md#services).

| Service | Getting a key |
|---|---|
| Groq | Sign in at [console.groq.com](https://console.groq.com), open **API Keys**, **Create API Key**. Free daily allowance. |
| OpenAI | Sign in at [platform.openai.com](https://platform.openai.com), add a payment method under **Billing**, then **API keys** → **Create new secret key**. Billed per minute of audio. |
| Mistral | Sign in at [console.mistral.ai](https://console.mistral.ai), choose a plan under **Billing**, then create a key under **API Keys**. |
| Together AI | Sign in at [api.together.ai](https://api.together.ai); the key is under **Settings → API Keys**. |
| Qwen Cloud | Its own connection; see [Qwen Cloud](qwen-cloud.md). |
