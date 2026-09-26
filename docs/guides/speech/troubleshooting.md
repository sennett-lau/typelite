# Speech troubleshooting

## Test fails

| Message | What to check |
|---|---|
| Speech server offline | The server is running, and the address and port are right. |
| Speech server timed out | The server is busy or too slow; try a smaller model or a GPU server. |
| HTTP 401 / rejected the API key | The key is correct and has billing or credit. For Qwen Cloud, `InvalidApiKey` means the key is wrong or not for this address. |
| HTTP 404 | The address ends with `/v1` (or the service's base path), not with `/audio/transcriptions`. For Qwen Cloud, `Model not exist.` means the model name is wrong. |
| Replace `<computer-ip>` … | The address still holds a placeholder; enter the other computer's address. |

## "Didn't catch that"

Typelite found no speech: the recording held less than 200 ms of voice, or the recogniser
returned only a phrase it invents for silence. Speak a little longer or closer to the microphone,
and check the microphone chosen in Settings. The log line `speech check: …` gives the numbers.

## It is slow

The Test button and the **Speed board** on the Home page measure the whole round trip: upload,
recognition and the reply. Ways to speed it up:

- On an Intel Mac, or with Built-in on an older Mac, use a GPU computer on your network or a
  cloud service ([OpenAI-compatible](openai-compatible.md)).
- Choose a fixed spoken language instead of auto-detect, which saves a detection pass.
- Use a smaller model (Built-in **Faster**, or `small` on your own server), at some cost in
  accuracy.
- See [Benchmarks](../benchmarks.md) and [Choosing a model](../models.md).

## Wrong language or script

- Mixed languages work best with auto-detect. A fixed language forces every recording into it.
- Cantonese comes back as standard written Chinese from whisper, and in Simplified characters from
  Qwen Cloud. AI polish and your language settings turn it into the style you want; see
  [Languages](../languages.md).

## Still stuck

Check `~/Library/Logs/Typelite/typelite.log`: each speech request logs the endpoint, status and
duration (never your text). Attach it to an issue; see
[Reporting bugs](../../../CONTRIBUTING.md#reporting-bugs).
