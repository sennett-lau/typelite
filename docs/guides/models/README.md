# Choosing models

Typelite uses two models: a **speech recognition** model turns your voice into text, and an **AI
polish** model cleans that text up. Two questions decide which ones to use:

1. **Does your language need special care?** If you mostly dictate in English, or you are happy
   with how the general setup writes your language, choose both models by hardware in the
   [task guides](#task-guides). If you want your language written a particular way, for example
   Cantonese as Hong Kong people type it, start with the
   [guide for your language](../languages/README.md#language-guides): the speech model matters
   most there.
2. **What hardware will run them?** Your computer (Built-in), a GPU computer on your network, or a
   cloud service with your own key.

These are starting points, not requirements: any model that fits your hardware and does the job
well will work. Measured numbers are in [Benchmarks](../benchmarks/README.md).

## Start here

| You… | Speech recognition | AI polish | Language instructions |
|---|---|---|---|
| Dictate mostly in English, or are happy with the general setup | [By hardware](speech-recognition.md#by-hardware) | [By hardware](ai-polish.md#by-hardware) | Not needed |
| Dictate in a language the general setup writes the way you speak it (Mandarin, Japanese, most European languages) | [By hardware](speech-recognition.md#by-hardware) | [By hardware](ai-polish.md#by-hardware); for Chinese, a Qwen model | A [language preset](../languages/README.md#language-presets) helps with wording and vocabulary |
| Want your language or dialect written as you speak it, such as Cantonese | The [guide for your language](../languages/README.md#language-guides) | By hardware, or as the guide says | The preset the guide names |

## Task guides

| Guide | Covers |
|---|---|
| [Speech recognition](speech-recognition.md) | Kinds of speech model (whisper, Qwen3-ASR, cloud), what to run on your hardware, languages. |
| [AI polish](ai-polish.md) | Instruct and thinking models, sizes by hardware, uncensored models, turning off thinking. |

## Language guides

Setups for one language, for people who want it written their way, are with the language
settings: see [Languages → Language guides](../languages/README.md#language-guides), for example
[Cantonese](../languages/cantonese.md). That section also explains how to tell whether your
language needs one.
