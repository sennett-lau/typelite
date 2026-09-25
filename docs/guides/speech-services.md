# Speech services

Typelite can send your recordings to any speech service that uses the OpenAI transcription API
(`POST <address>/audio/transcriptions`), and to [Qwen Cloud](#qwen-cloud), which has its own API. In **Settings → Speech → Presets** (or "Use your own
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
| Qwen Cloud | cloud | `https://token-plan.maas.qwencloudapi.com/api/v1` | `qwen-audio-3.0-asr-flash` | required |

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

## Qwen Cloud

Qwen Cloud's speech model does not use the OpenAI transcription API. Typelite recognises it by
the address and sends the recording to Qwen's own speech API instead; the form shows
"Qwen Cloud: sent to Qwen's own speech API" under the fields.

- **Address:** `https://token-plan.maas.qwencloudapi.com/api/v1`. The console shows an address
  ending in `/compatible-mode/v1` next to your key; you can paste that too, and Typelite changes
  it to `/api/v1` when you press Test or Save (the speech model does not work on the
  compatible-mode address). Alibaba Model Studio (DashScope) addresses such as
  `https://dashscope-intl.aliyuncs.com/api/v1` are sent the same way, but only the Token Plan
  address has been tested.
- **Model:** `qwen-audio-3.0-asr-flash`.
- **API key:** required.
- **Recording limit:** at most 290 seconds (4 min 50 s), 4 minutes by default. Qwen returns
  nothing for audio over 5 minutes, which looks the same as silence, so Settings → Speech →
  Recording caps the limit while a Qwen Cloud preset is in use. Your longer choice is kept for
  other presets.
- **Languages:** leave the language on auto-detect for mixed English, Mandarin and Cantonese.
  Chinese comes back in **Simplified characters**, and Cantonese as colloquial Cantonese (for
  example `听日下昼三点开会得唔得`), not in Traditional characters.

Getting a key:
1. Sign in to the Qwen Cloud console and subscribe to a **Token Plan**.
2. Create an API key and copy it into Typelite, together with the address above.

## Running your own server

- whisper.cpp on this Mac, or on another computer: see [Speech recognition](speech-recognition.md).
- Speaches on a computer with an NVIDIA GPU: see [Speech recognition → option B](speech-recognition.md#b-a-gpu-computer-on-your-network).

## If Test fails

| Message | What to check |
|---|---|
| Speech server offline | The server is running and the address and port are right. |
| Speech server timed out | The server is busy or too slow; try a smaller model or a GPU server. |
| HTTP 401 / rejected the API key | The key is correct and has billing or credit. For Qwen Cloud, `InvalidApiKey` means the key is wrong or not for this address. |
| HTTP 404 | The address ends with `/v1` (or the service's base path), not the full `/audio/transcriptions` path. For Qwen Cloud, `Model not exist.` means the model name is wrong. |

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
