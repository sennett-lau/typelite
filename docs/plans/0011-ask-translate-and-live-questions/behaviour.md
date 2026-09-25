# Behaviour

Back to [index](index.md).

## Highlight and translate

| The user does | Result |
|---|---|
| Selects text, taps Translate, says nothing, taps Translate again (or Dictate) | The selection is replaced by its translation into the target language. |
| Same, but presses Switch language before finishing | The target moves to the next chosen language; the pill shows it (chips as in Translation mode). |
| Selects text, uses Ask, says "translate this into Japanese" | The selection is replaced by the Japanese translation. |
| Says a Chinese variant ("Traditional Chinese", "Hong Kong Chinese", "Taiwanese Chinese", "Simplified Chinese", "Cantonese") | Maps to `zh-Hant-HK`, `zh-Hant-TW` or `zh-Hans`; plain "Chinese" = Simplified. |
| Selects text, uses Translate, and speaks | Speech is treated as the instruction when it names a language; otherwise it is dictated and translated as before. |

- Target language order: a language named in speech, then the active translation language.
- If nothing is selected, Translate behaves exactly as today (speech → translation).
- The selection is read with the existing selected-text capture; nothing is stored.

## Live questions (no web search yet)

- Before answering an open question (no selection), Ask decides whether it needs live or
  post-training information: news, "today/latest/current", prices, weather, scores, schedules,
  recent releases. The AI makes this call with a short classification request; a keyword list is
  the fallback when that request fails.
- If it does, the Ask panel shows:
  - Title: "Needs live information".
  - Body: "This question needs up-to-date information from the web. Typelite can't look things up
    yet."
  - Buttons: **Answer anyway** (answers from the model with the note "May be out of date — no web
    search was used") and **Close**. A disabled **Set up web search** placeholder is not shown
    now; the layout leaves room for it.
- Site searches ("search standing desks on Amazon") keep opening the site's search page; they
  are not live questions.
- The decision and its reason are logged (no question text).
