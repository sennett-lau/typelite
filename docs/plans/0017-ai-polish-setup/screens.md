# Screens

Every screen and state in words. Back to [index](index.md). Open [mock.html](mock.html) for the
exact look; it follows the speech layout in [0015 layout](../0015-two-tab-speech/layout.md).

## Onboarding → AI polish

- Title "AI polish", subtitle "Cleans up what you said: fillers out, corrections applied,
  punctuation in."
- Built-in card (fixed height), "Built-in" + "Recommended", one line "Runs a small open model
  inside Typelite on this Mac. No other software needed." The states are the speech ones:

| State | Status slot | Action |
|---|---|---|
| Not set up | model cards + hardware note | **Set up** |
| Downloading | `Downloading 42%` · "Best quality · 1.0 of 2.5 GB", bar, speed and time left, then "Checking the file" | **Cancel** |
| Ready | `Ready` · model name; "Qwen3 4B Instruct · 2.5 GB · tested on this Mac in 0.6 s" | **Change model** |
| Failed | `Download failed` · "Nothing was installed"; reason, "Try again to resume" | **Try again** |
| No model suits this Mac | only the note ("This Mac can't run a built-in AI model well. Use your own server or API key instead.") | none |

- Below the card: **Use your own server or API key…** and **Skip for now** (dictation still
  works and pastes the raw transcript).
- Next is enabled when Built-in is ready or a preset passed Test.

## Your server or API key (sheet)

The speech sheet with AI wording: title "Your own server or API key" + **Learn more**
(`https://github.com/sennett-lau/typelite/blob/main/docs/guides/ai-polish.md`); saved list,
or the form when there are none. Form: Address (placeholder `https://api.openai.com/v1`), Model
(placeholder `gpt-4.1-mini`), API key (placeholder "Optional"), Name (auto-filled from the host).
A collapsed **Advanced** holds Extra fields (JSON, placeholder `{"reasoning_effort": "none"}`).

## Settings → AI

1. **AI polish uses** header with **Learn more** at the right; two option cards: "Built-in ·
   Runs a small open model on this Mac" and "Your server or API key · Ollama, OpenAI, Groq,
   OpenRouter…". When no model suits the Mac, the Built-in card is dimmed, reads "Not available
   on this Mac", cannot be selected, and the page shows the server option.
2. Built-in details: "Model" group with the model cards (hardware note in the header), then the
   status row: `Not downloaded` + **Download**, `Downloading n%` + bar + **Cancel**, `In use` +
   detail + **Delete**, `Download failed` + **Try again**. Both are hidden when no model suits.
3. Server details: the speech layout (preset picker top right, four fields, Test/Save, Delete
   this preset), plus the collapsed **Advanced** with Extra fields. "Fetch available models" is
   dropped, as in the speech form.
4. **Polish** group: "Clean up dictation" switch (off pastes exactly what was said); Style as
   four option cards (Minimal, Clean, Structured, Professional); "Match the app you're in"
   switch with a **Manage app mappings** link; browser access (Gmail, Docs, Slack on the web)
   as a switch under it.
5. **Translation** group: languages as chips (default first, up to three, **+ Add**), and the
   "Always translate output" switch.
6. **Advanced** (collapsed): use selected text in Ask and polish; custom instructions (2000
   characters).

No existing setting is removed; only grouping and wording change.

## Settings → Speech changes

- **Learn more** (to `docs/guides/speech-services.md`) moves to the "Speech recognition uses"
  header; the links under the preset form and on the "Add your server or API key" header go.
- When no speech model suits the Mac, the model cards' status row and Download button are
  hidden, and the Built-in card behaves like the AI one above.
