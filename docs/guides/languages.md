# Languages

Typelite handles languages in two places: **speech recognition** decides which language it heard,
and **AI polish** writes the text, following instructions for that language. This page covers
translation languages, their instructions, how Typelite recognises the language you spoke, and the
language presets from the repository.

## Spoken language (recognition)

**Settings → Speech → Language → Spoken language** is **Auto-detect** by default. Auto-detect
handles mixed languages, such as English with Cantonese or Mandarin. A fixed language forces every
recording into it, but saves a detection pass and can help very short clips.

- whisper (Built-in, or a whisper.cpp or Speaches server) writes Cantonese as standard written
  Chinese. Qwen Cloud writes Cantonese as colloquial Cantonese, in Simplified characters.
- AI polish then writes the final text in the style your language instructions ask for.

## Translation languages

**Settings → AI → Translation** lists your languages (up to three), one row each:

- The **order** is the order the Switch language key and the pill follow. Drag a row by its
  ⋮⋮ handle to change it (or focus the handle and press ↑ / ↓).
- The grey line says where the language's instructions come from: a preset from the library,
  your own edit ("Based on … · edited"), or the built-in instructions.
- The **switch** turns the language's instructions on or off. Off means a plain translation
  into that language, and no extra notes when you dictate in it. Your text is kept.
- **Edit** opens the language's settings, ✕ removes it, and **＋ Add language** adds one.

Every translation uses the AI polish model: the Translate shortcut, "Always translate output",
highlight-and-translate and Ask's "translate this into …". While a Translate recording runs, the
Switch language key (Shift by default) or a click on the language name in the pill moves to the
next language; the first key of the Translate shortcut stops.

## Language instructions

Each language can carry instructions: how to write it, which words and grammar to use, which
script, which words stay in English, with a few examples. They come from one of three places:

| Source | What it is |
|---|---|
| Built-in | A plain, natural translation for most languages, with extra rules for Chinese (see below). |
| A language preset | A text from the repository's [preset catalogue](../../presets/languages/README.md), written and reviewed by people who speak the language. |
| Your own edit | Any of the above, changed by you in the language's settings. |

Typelite always adds its own rules around the instructions (output only the result, keep the line
breaks, use the right Chinese script), so a preset or an edit cannot make the AI add notes or
answer in another language.

The built-in instructions are a plain, natural translation for most languages, plus:

| Language | Built-in instructions |
|---|---|
| Chinese (Traditional, Hong Kong) | Colloquial written Cantonese as Hong Kong people type it (嘅 咗 喺 啲 冇 唔…), with the English words Hongkongers say in English kept in English: "你可唔可以幫我check下個proposal嘅deadline？". Edit it if you want formal written Chinese. |
| Chinese (Traditional, Taiwan) | Taiwan Mandarin wording and vocabulary (軟體, 網路, 計程車). |
| Chinese (Simplified) | Mainland wording and vocabulary (软件, 网络, 出租车). |

Small 4B models write passable Cantonese but still slip into written Chinese now and then; a
larger or Cantonese-tuned model as the AI polish model does better. See
[Choosing a model](models.md#by-language).

## Language presets

A language preset tells the AI how to write one language. Presets live in the
[`presets/languages`](../../presets/languages/README.md) folder of the Typelite repository; anyone
can add one with a pull request (see [Contributing a language preset](../../CONTRIBUTING.md#language-presets)).

### Choosing a preset

1. Press **Edit** on a language, then **Browse presets** (or **Change**).
2. The list starts with the **Built-in default**, then the presets that fit the language:
   **Official** ones first, and the one written for exactly your language (for example
   `en-GB`) before a general one. Each shows its summary, version, authors and a model tip.
   English presets carry short notes per region, so English (UK) gets British spelling.
3. **Preview** downloads the preset and shows the full text the AI will get. Nothing is used
   until you press **Use this preset**, then **Save**.

You can edit the text afterwards. **Reset to preset** brings back the preset's text; **Reset
to default** goes back to the built-in instructions.

### Where the instructions are used

- **Translating into the language** uses them whenever the language is on.
- **Dictating in the language** (Dictate, no translation, no selected text) uses them too, but
  only when Typelite recognises that you spoke that language. The **Recognition** tab shows how:
  1. **Hint characters and words** found in what you said pick the language with the most
     hits. The preset brings its own (Cantonese: 嘅 咗 喺 唔 聽日 …); add your own with
     **+ Add hint**.
  2. Otherwise the language **speech recognition heard** counts (for example `en`), unless the
     preset needs a hint. The Cantonese preset does: speech recognition says `zh` for Mandarin
     too, and Mandarin should not get Cantonese rules.
  3. Otherwise nothing is added and polish works as before.

  Built-in speech recognition reports the language it heard; a server gets asked for it with
  `response_format=verbose_json` (servers that do not support it keep working; see
  [OpenAI-compatible speech](speech/openai-compatible.md#the-protocol)). A speech preset with a
  fixed language counts as that language. A language on its built-in instructions has no
  recognition data, so only your own hints route to it.

### Updates

- A newer version shows an **Update** tag on the row and a banner in the sheet: **Preview** or
  **Update**. If you edited the text, it is never replaced: **Keep mine** keeps your text, **Use
  vN instead** shows the new text first.
- Tick **Update this preset automatically** to let a language follow new versions by itself.
  Then Typelite checks GitHub at most once a day, only while such a language is in use, and
  never replaces text you edited.

### Privacy and offline use

- Presets are downloaded with plain requests to `raw.githubusercontent.com`: no account, no
  identifiers, nothing about you, your languages or your text. GitHub sees your IP address, as
  with any download. Typelite goes online only when you browse presets, or once a day for
  languages with automatic updates on.
- Every download is checked against the size and SHA-256 hash in the library's index, and
  validated, before it is used. Downloaded presets are kept in Typelite's data folder.
- Offline, the built-in instructions and downloaded presets keep working; Browse shows what is
  downloaded and offers **Try again**.

## See also

- [Preset catalogue](../../presets/languages/README.md): every preset, grouped by language.
- [Choosing a model](models.md): models that suit your languages.
- [Sharing presets](sharing-presets.md): export and import of speech and AI presets (a different
  kind of preset: saved connections).
