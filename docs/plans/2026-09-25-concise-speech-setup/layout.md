# Layout

Back to [index](index.md).

## Type picker (segmented control)

| Type | Shows | Defaults |
|---|---|---|
| **Built-in (this Mac)** | Quick setup card if no model is installed; otherwise the installed model picker | `large-v3-turbo` |
| **Local server** | Address, Model | `http://127.0.0.1:8178/v1`, `large-v3-turbo` |
| **OpenAI-compatible (your key)** | Service (OpenAI · Groq · Custom), API key, Model; Address only for Custom | OpenAI: `https://api.openai.com/v1`, `whisper-1`; Groq: `https://api.groq.com/openai/v1`, `whisper-large-v3-turbo` |

Below the fields: **Test** with its result on the same line ("Works · 1.4 s" or the error), and
the "How to set this up" link, which opens the guide card in a sheet.

## Presets

- The type + service + fields *are* the preset. Built-in templates are selected by choosing the
  type/service; no name field.
- A small "Saved presets" menu next to the type picker lists the user's own presets and has
  **Add new preset…**, which opens the same fields plus a Name field, and **Delete** for the
  selected custom preset.
- A "server on another computer" is just Local server with a different address; if the user
  changes the address, Typelite offers "Save as a preset" with a suggested name ("Local server —
  192.0.2.10").

## Onboarding vs Settings

| | Onboarding | Settings → Speech |
|---|---|---|
| Type picker, fields, Test, guide link | yes | yes |
| Language | hidden (auto-detect) | shown, under the fields |
| Recording length limit | hidden | shown, in its own group |
| Saved presets menu | yes | yes |

Target: the onboarding step fits in the onboarding window without scrolling for every type.

The AI polish step follows the same pattern later (Local: Ollama on this Mac / another
computer; OpenAI-compatible with services OpenAI · Groq · OpenRouter · Custom).
