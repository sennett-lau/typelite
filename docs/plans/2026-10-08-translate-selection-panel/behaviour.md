# Behaviour

What the user does and sees. Back to [index](index.md).

## Flows

| The user does | Result |
|---|---|
| Highlights text, presses Ask, says "translate to English" | The pill thinks; the panel opens with the English translation. The highlight is unchanged. |
| Same, says "translate this" or "翻译一下" (no language) | The translation goes into the active translation language (Settings → Translation). |
| Same, says "translate this to Klingon" (a language Typelite does not know) | An ordinary Ask answer about the highlight, as before. |
| Presses **Copy** in the panel | The translation goes on the clipboard and stays there; the button shows "Copied ✓". |
| Presses **Replace the highlight** | The translation is pasted over the highlight in the app and the panel closes. If the paste fails, the panel says so and Copy still works. |
| Presses Escape or ✕ | The panel closes; nothing is changed or kept. |
| Highlights text and presses the Translate shortcut | Unchanged: the highlight is replaced by its translation. |

## Phrases recognised

The instruction must start with the verb, after optional openings.

- English: "translate", "translate this / it / the selection", "translate (this) to/into X",
  "what does this say in X", "what is this in X", "say this in X". Openings: "please",
  "can you", "could you", "would you", "will you", "hey", "ok", "okay", "now".
- Chinese: "翻译 / 翻譯" first, after "请", "帮我", "麻烦", "把这段", "把它" and the like:
  "翻译成英文", "把這段翻譯成廣東話", "翻譯一下".
- Japanese: any request containing "翻訳" with a known language ("英語に翻訳して"), or a bare
  "翻訳して".
- Language names are the ones the Translate shortcut already understands, including the Chinese
  variants (Simplified, Hong Kong, Taiwan).

## The panel

- Title: "Translated to English" (the language name in the UI language), not the spoken
  instruction.
- Body: the full translation.
- Buttons: **Replace the highlight** and **Copy** (primary). Escape closes, as for every Ask
  result.
- The panel is the same non-activating glass panel as other Ask answers, so the user's app keeps
  focus and its highlight.
