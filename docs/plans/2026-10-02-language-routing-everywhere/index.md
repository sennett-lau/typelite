# Language routing everywhere

The language presets chosen in Settings → AI → Translation shaped translation, and polish only
when the router recognised the language; Ask never used them. A Cantonese question asked with
Ask was answered in Simplified Chinese, and Cantonese dictation often got plain polish. This
plan routes Dictate and Ask through the same router and makes it recognise Cantonese reliably,
so one preset decides how all three actions write a language.

Status: building — 2026-10-02

Changes two decisions of [language-prompt-library](../2026-09-26-language-prompt-library/index.md):
the router now also runs for Ask, and `require_hint` applies only to a shared speech code.

## Goals

- Dictate, Translate and Ask anything write a language the way its preset says.
- Cantonese is recognised from what speech recognition reports (`yue`) or from its words,
  whether the transcript is in Traditional or Simplified characters.
- An Ask question routed to a language is answered in that language and its characters, as the
  preset describes (for Cantonese: written Cantonese, as Hong Kong people type it).

## Non-goals

- A new preset field or format version: existing presets keep working unchanged.
- Routing the typed Ask question (no speech, so no detected language; unchanged).
- Changing the upcoming-event answers of plan `ask-web-search`, which quote their sources.

## Key decisions

| Decision | Reason |
|---|---|
| `require_hint` applies only when the reported code is a macrolanguage (`zh`) | Whisper reports `zh` for Mandarin and Cantonese, so a hint is still needed there; Qwen3-ASR and ElevenLabs report `yue`, which is only Cantonese. Logs showed `detected yue; zh-Hant-HK needs a hint`. |
| Chinese hints also match the transcript converted to Traditional characters | Qwen3-ASR writes Cantonese in Simplified (听日), the presets' hints are Traditional (聽日), so only the characters common to both matched. |
| Ask routes the spoken question with the polish router, then converts a Qwen3-ASR question to the language's characters | The same decision as Dictate, from the same data; the question shown in the panel matches the answer's script. |
| The routed preset's instructions are added to Ask's prompt (inside `<language_instructions>`), and the answer is converted to the language's characters | Answers then use the preset's wording, not only its script; a small model mixes Traditional and Simplified. The instructions say how to write, never what to answer. |
| Without a routed language, Ask keeps the question-language detection of plan `ask-web-search` | Users without presets get the same answers as before. |

## Behaviour

| Action | Language decided by | Applied to |
|---|---|---|
| Translate | The target language (unchanged) | The translation |
| Dictate | Router: hints, else the reported code | Polish notes; Qwen3-ASR transcript script |
| Ask (spoken) | Router, as Dictate | Question script (Qwen3-ASR), answer prompt, answer script; web answers too |
| Ask: Answer anyway | Router on the question's hints | Answer prompt and script |

Router steps (changed parts in bold): 1. hints, **also in Traditional characters**; 2. the
reported code, **with `require_hint` only for `zh`**; 3. none.

Live check (Qwen 3.5 4B, Cantonese question 點解天係藍色嘅？): without routing the answer was
formal written Chinese in Simplified characters (天系蓝色因于瑞利散射…); routed, it was written
Cantonese in Hong Kong characters (天係藍色因為太陽光喺大氣層度散…所以天就係藍色喇).

## Part files

| File | Covers |
|---|---|
| (none) | This plan is small enough for one file. |

## Open questions

- The contributor guide (`presets/languages/README.md`) still says `require_hint` applies to
  every detected code; its wording is to be agreed before it changes.
