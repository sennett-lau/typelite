# Speech services

Typelite can send your recordings to any speech service that uses the OpenAI transcription API
(`POST <address>/audio/transcriptions`). In **Settings → Speech → Presets** (or "Use your own
server or API key…" during setup), enter the service's **Address**, **Model** and, for cloud
services, your **API key**, then press **Test**.

Prefer to keep everything on your Mac? Use **Built-in** instead; no account or server needed.

## Supported services

| Service | Runs on | Address | Model | API key |
|---|---|---|---|---|
| whisper.cpp server | your Mac or another computer | `http://127.0.0.1:8178/v1` | `large-v3-turbo` | not needed |
| Speaches | another computer (GPU) | `http://<computer-address>:8000/v1` | `Systran/faster-whisper-large-v3` | not needed |
| LocalAI | your Mac or another computer | `http://127.0.0.1:8080/v1` | `whisper-1` | not needed |
| OpenAI | cloud | `https://api.openai.com/v1` | `whisper-1` or `gpt-4o-transcribe` | required |
| Groq | cloud | `https://api.groq.com/openai/v1` | `whisper-large-v3-turbo` | required (free tier) |
| Mistral | cloud | `https://api.mistral.ai/v1` | `voxtral-mini-latest` | required |
| Together AI | cloud | `https://api.together.xyz/v1` | `openai/whisper-large-v3` | required |

Other services that follow the same API should work too: enter their address and model.

### What the address looks like

- Always ends before `/audio/transcriptions`; Typelite adds that part. For OpenAI that is
  `https://api.openai.com/v1`, not `https://api.openai.com/v1/audio/transcriptions`.
- A server on another computer uses that computer's address, for example
  `http://192.168.1.20:8000/v1`, or its Tailscale name if you use Tailscale.
- `http://` is fine on your own network; cloud services use `https://`.

## Getting an API key

Keys are stored in the macOS Keychain and only sent to the service they belong to. Cloud
services receive your audio.

**OpenAI**
1. Sign in at [platform.openai.com](https://platform.openai.com).
2. Add a payment method under **Billing** (speech is billed per minute).
3. Open **API keys**, choose **Create new secret key**, and copy it into Typelite.

**Groq** (has a free daily allowance)
1. Sign in at [console.groq.com](https://console.groq.com).
2. Open **API Keys** and choose **Create API Key**.

**Mistral**
1. Sign in at [console.mistral.ai](https://console.mistral.ai).
2. Choose a plan under **Billing**, then create a key under **API Keys**.

**Together AI**
1. Sign in at [api.together.ai](https://api.together.ai).
2. Your key is under **Settings → API Keys**.

## Running your own server

- whisper.cpp on this Mac, or on another computer: see [Speech recognition](speech-recognition.md).
- Speaches on a computer with an NVIDIA GPU: see [Speech recognition → option B](speech-recognition.md#b-a-gpu-computer-on-your-network).

## If Test fails

| Message | What to check |
|---|---|
| Speech server offline | The server is running and the address and port are right. |
| Speech server timed out | The server is busy or too slow; try a smaller model or a GPU server. |
| HTTP 401 / rejected the API key | The key is correct and has billing or credit. |
| HTTP 404 | The address ends with `/v1` (or the service's base path), not the full `/audio/transcriptions` path. |

## Share presets

**Settings → Speech → Your server or API key** has **Import…** and **Export…** under the form.

- **Export…** lists your saved speech presets; untick the ones to leave out and pick where to
  save the `.typelite-presets.json` file. The Built-in preset is never exported (it is a model
  file on this Mac).
- API keys are left out. Tick **Include API keys** only if the person who gets the file may use
  your key: anyone who has the file can.
- **Import…** opens such a file and lists its presets (name and address). The ticked ones are
  added; a name that is taken gets a number, like "Groq (2)". Nothing is replaced, and the
  preset in use does not change. Pick an imported preset and press **Test** before you use it.
- A file from a newer Typelite, or one with an address that is not `http://` or `https://`,
  is rejected. Presets of a kind this version does not know are skipped.
