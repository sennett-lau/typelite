# Sharing presets

A preset is a saved connection: an address, a model and, for AI, its extra request fields. You can
export your speech and AI presets to a file and import them on another computer or give them to
someone else.

## Where

- Speech: **Settings → Speech → Your server or API key**, **Import…** and **Export…** under the
  form.
- AI: **Settings → AI → Your server or API key**, **Import…** and **Export…** under the preset's
  fields.

## Export

- **Export…** lists your saved presets; untick the ones to leave out and pick where to save the
  `.typelite-presets.json` file. Only saved presets are exported, so save your edits first.
- The Built-in presets are never exported (they are model files on your computer). Shipped AI
  presets you have not changed, and addresses that still hold `<computer-ip>`, are not offered.
- AI presets are exported with their extra request fields.
- **API keys are left out.** Tick **Include API keys** only if the person who gets the file may
  use your key: anyone who has the file can.

## Import

- **Import…** opens such a file and lists its presets (name and address). The ticked ones are
  added; a name that is taken gets a number, like "Groq (2)".
- Nothing is replaced, and the preset in use does not change. Pick an imported preset and press
  **Test** before you use it.
- A file from a newer Typelite, or one with an address that is not `http://` or `https://`, is
  rejected. Presets of a kind this version does not know are skipped.
- Qwen Cloud speech presets keep their connection; see [Qwen Cloud](speech/qwen-cloud.md).

Language presets (how Typelite writes each language) are shared differently: through the
repository's catalogue. See [Languages](languages.md).
