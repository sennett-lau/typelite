# Set up speech recognition

Typelite sends your recording to a speech-recognition server and gets the text back. Pick one of
the three options below, then enter its details in **Settings → Speech** (or the setup step) and
press **Test**.

| Option | Cost | Privacy | Speed on a short sentence |
|---|---|---|---|
| A. whisper.cpp on this Mac | Free | Audio never leaves the Mac | About 1.5–4 s on an M1 Pro; faster on newer Macs |
| B. A GPU computer on your network | Free | Audio stays on your network | About 0.3–0.8 s with an NVIDIA GPU |
| C. A cloud service with your own key | Pay per minute | Audio goes to that company | About 0.5–1.5 s |

## A. whisper.cpp on this Mac

Needs [Homebrew](https://brew.sh). Run:

```sh
curl -fsSL https://raw.githubusercontent.com/sennett-lau/typelite/main/scripts/setup-local-whisper.sh | bash
```

or, from a copy of this repository, `bash scripts/setup-local-whisper.sh`.

The script installs whisper.cpp from Homebrew, downloads the `large-v3-turbo` model from the
official whisper.cpp Hugging Face repository, checks its SHA-256, starts the server as a login
item, and runs a test. It prints the values to use:

| Field | Value |
|---|---|
| Preset | whisper.cpp on this Mac |
| Base URL | `http://127.0.0.1:8178/v1` |
| Model | `large-v3-turbo` |
| Language | Auto |

Options: `PORT=9000 bash …` for another port, `HOST=0.0.0.0 bash …` to share it with other
computers on your network, `bash scripts/setup-local-whisper.sh --uninstall` to remove it.

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

## B. A GPU computer on your network

A computer with an NVIDIA GPU is much faster than a Mac for this. Run
[Speaches](https://github.com/speaches-ai/speaches), an OpenAI-compatible server built on
faster-whisper, with Docker:

```sh
docker run -d --name speaches --gpus=all -p 8000:8000 \
  -v hf-hub-cache:/home/ubuntu/.cache/huggingface/hub \
  ghcr.io/speaches-ai/speaches:latest-cuda
```

Then in Typelite:

| Field | Value |
|---|---|
| Preset | Speech server on another computer |
| Base URL | `http://<that-computer's-ip>:8000/v1` |
| Model | `Systran/faster-whisper-large-v3` |

- Allow port 8000 through that computer's firewall, for your local network only.
- Across networks, use a private network such as Tailscale instead of opening the port to the
  internet.
- No NVIDIA GPU? whisper.cpp also runs on Linux and Windows; start `whisper-server` with
  `--host 0.0.0.0` and use its address the same way.

## C. A cloud service with your own key

| Service | Base URL | Model |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `whisper-1` |
| Groq | `https://api.groq.com/openai/v1` | `whisper-large-v3-turbo` |

Paste your API key into the preset's key field. Typelite stores it in the macOS Keychain.

## If it is slow

The Test button measures the full round trip: upload, recognition and the reply. On a Mac the
recognition itself is most of it. Ways to speed it up:

- Use option B; a GPU is several times faster.
- Choose a fixed language instead of Auto, which saves a detection pass.
- Use a smaller model, for example `ggml-small-q5_1.bin` (`MODEL=small-q5_1 bash …`), at some
  cost in accuracy.
