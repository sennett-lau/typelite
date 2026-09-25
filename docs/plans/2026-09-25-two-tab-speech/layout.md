# Layout

Back to [index](index.md). Open [mock.html](mock.html) for the exact look.

## Hardware check (Built-in models)

| Condition | Best accuracy (574 MB) | Faster (190 MB) |
|---|---|---|
| Apple Silicon, ≥ 8 GB memory, free disk ≥ 1.1 × size | offered, recommended | offered |
| Apple Silicon < 8 GB, or Intel | not offered | offered |
| Free disk < 1.1 × 574 MB but ≥ 1.1 × 190 MB | not offered | offered |
| Not enough disk for either | none; show how much space is needed | |

Read chip (Apple Silicon vs Intel), memory and free space of the models folder's volume when
the screen opens. A note says what was detected ("This Mac: Apple M1 Pro, 32 GB memory") and,
when the large model is left out, why.

## Onboarding → Speech recognition

- Title "Speech recognition", subtitle "Turns your voice into text. It runs on this Mac."
- **Built-in card** (fixed height; icon, "Built-in" + "Recommended" tag, one line "Runs Whisper
  inside Typelite on this Mac. No other software needed."), then the state slot and the action:

| State | Status slot | Action (bottom right) |
|---|---|---|
| Not set up | model option cards (radio) + hardware note | **Set up** |
| Downloading | `Downloading 42%` badge · "Best accuracy · 241 of 574 MB", progress bar, "12 MB/s · about 25 s left" (then "Checking the file") | **Cancel** |
| Ready | `Ready` badge · model name; "Whisper large-v3-turbo · 574 MB · tested on this Mac in 1.9 s" | **Change model** |
| Failed | `Download failed` badge (red tint) · "Nothing was installed"; reason and "Try again to resume" | **Try again** |

- Below the card: link **Use your own server or API key…** (left) and **Skip for now** (right).
- Next is enabled when Built-in is ready or a preset passed Test.

## Your server or API key (sheet in onboarding)

- Title "Your own server or API key" with **Learn more** at the right (opens
  `https://github.com/sennett-lau/typelite/blob/main/docs/guides/speech-services.md`).
- With saved presets: a list (name + host), **+ Add preset**, **Cancel**, **Test and use**.
- With none, or after **+ Add preset**: the form, titled "Add your server or API key" (or
  "Add preset"); **← Saved presets** only when there are saved presets, otherwise **Cancel**.
- Form: Address (placeholder `https://api.openai.com/v1`), Model (placeholder `whisper-1`),
  API key (placeholder "Optional"), Name (placeholder "Filled in for you"; auto-filled with the
  address's host while the user has not typed a name). **Test** result on the same line, then
  **Save and use**.

## Settings → Speech

- Settings sections are **toolbar tabs** across the top of the Settings page: icon above label —
  General (gear), Speech (mic), AI (sparkle), Prompts, System — with a hairline under the bar and
  the current tab in the accent colour. This replaces the segmented section control.
- **Speech recognition uses**: two option cards (radio) — "Built-in · Runs Whisper inside
  Typelite on this Mac" and "Your server or API key · OpenAI, Groq, a whisper.cpp server…".
  Selecting one makes it the active engine and shows its details below.
- Built-in details: "Model" group with the same option cards (hardware note at the top right of
  the group header), then a status row with the same badges: `Not downloaded` + **Download**,
  `Downloading n%` + bar + **Cancel**, `In use` + detail + **Delete**, `Download failed` +
  **Try again**.
- Your server or API key details: with saved presets, a "Preset" group header with the picker at
  the upper right (saved presets and **+ Add preset…**), the same four fields filled with the
  selected preset, Test/Save on one line, **Delete this preset**, and a "Learn more" line. With
  none: header "Add your server or API key" + **Learn more** and the empty form.
- Below: Language group (auto-detect by default) and Recording group.

The other Settings sections use the same toolbar; their content is unchanged.

## Migration

Existing presets keep working. Unedited old server/cloud templates are dropped from the saved
list; edited and user-created presets stay; the built-in model preset stays; the active preset
stays valid.
