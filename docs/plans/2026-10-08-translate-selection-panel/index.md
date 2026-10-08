# Translate a highlight into the Ask panel

Highlight text in any app (a Japanese web page, a message in another language), press Ask and say
"translate to English", and the translation shows in the Ask panel above the pill, as in
Typeless. The highlight is not touched; the panel offers **Copy** and **Replace the highlight**.
This changes how Ask handles translation requests on a highlight. Before this plan Ask replaced
the highlight with the translation.

Status: building (2026-10-08)

Supersedes one decision of
[ask-translate-and-live-questions](../2026-09-25-ask-translate-and-live-questions/index.md):
"Selected text + Ask + 'translate this into X'" no longer replaces the selection.

## Goals

- Read text you cannot or do not want to edit: a translation of the highlight in the Ask panel,
  never an automatic change to the user's text.
- Understand the ways people actually ask: "translate to English", "translate this", "what does
  this say in Japanese", "翻译成英文", "翻譯一下", "英語に翻訳して".
- Translate the whole highlight, into the right language and Chinese script.
- Replace the highlight only when the user presses the button.

## Non-goals

- Changing the Translate shortcut. With a highlight it still translates in place; it is the
  "writing" path.
- Storing translations or highlights. Nothing is kept after the panel closes (no history).
- Languages outside Typelite's translation list.

## Key decisions

| Decision | Reason |
|---|---|
| The panel translation is an Ask feature; the Translate shortcut keeps replacing in place | Ask is for understanding (answers show in the panel); Translate is for writing. A read-only page cannot be replaced anyway. Each shortcut keeps one predictable result. |
| Ask + highlight + a translate request routes to `TranslateSelection` with placement `PopupAnswer` | Reuses the AI polish translation path (presets, language routing, Chinese script conversion) instead of the short Ask answer, which was limited to 40 words and so cut long text. |
| A small detector in `voice_intent/language.rs` decides, before the command grammar | The grammar knew only "translate this to X" in English and Chinese; "translate to English" and Japanese requests fell through to a short answer. |
| The request must start with a translate verb, after openings such as "please", "can you", "请", "帮我把这段" | "Don't translate this" and "why is this translated so badly" stay questions. |
| Target: the language named in speech, else the active translation language | Same order as the Translate shortcut; no hidden English default. |
| With no known language, only a bare request ("translate this", "翻译一下") uses the active language | "Translate this to Klingon" must not quietly go into another language; it stays an Ask answer. |
| Replace the highlight uses the panel's existing paste (`insert_ask_text`) | The panel never takes focus, so the highlight is still selected and ⌘V replaces it, as "Try replacing again" already does. |
| The `translate_selection` routing setting still turns it off | Same switch as before. |

## Parts

| File | Covers |
|---|---|
| [behaviour.md](behaviour.md) | What the user does and sees, phrases recognised, the panel. |
| [architecture.md](architecture.md) | Routing, the pipeline call, result fields, privacy and logs. |

## Open questions

- Should the Translate shortcut with a highlight and no speech also show the panel when the
  highlight is in a read-only place (a web page)? That needs a reliable "is this editable" check.
