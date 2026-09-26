# Pages

The onboarding layout and every shortcut page. Back to [index](index.md).

## Layout (every onboarding step)

```
┌ close ────────────────────────────┐
│            • • • ━ • •            │  step dots
│                                   │
│         Title                     │  ┐
│         Subtitle                  │  │ one block, centred;
│              22 pt                │  │ scrolls from its top
│         Content (max 400 pt)      │  │ when taller than the space
│                                   │  ┘
├───────────────────────────────────┤
│ Back                 Skip   Next  │  footer
└───────────────────────────────────┘
```

- The speech step keeps its wider content (480 pt, plan `two-tab-speech`).
- The welcome, microphone, speech and AI steps keep their content; they only move into the
  centred block.

## Page order

Steps 1–4 stay as they are (welcome, microphone, speech, AI). Then, for Dictate, Translate and
Ask anything in turn: the setup page, exercise 1, exercise 2. That is 13 dots. The shortcut tour
from Home starts at the Dictate setup page and cannot go back past it.

## Setup page

- Title: the role name; subtitle: what it does.
- A card with the shortcut as large key caps. Clicking them records new keys (as in Settings).
- One hint: Dictate "Press to start, press again to stop."; Translate "Press to start. While
  recording, <first key> stops."; Ask "Press to start, press again to send." Then "Click the
  keys to choose different ones."
- Under the card: "Next: 2 short exercises to try it."
- Footer: Back · Try it. Try it needs a shortcut, and for Translate at least one language.

## Translate languages and pill preview

- "Translate into" with "n of 3", then three equal slots in one row. A chosen language shows
  its name and ✕ (and its number when two or more are chosen). The first empty slot is a dashed
  "+ Add" that opens the language list; the others are faint dashed placeholders. At three there
  is no add slot.
- The first language becomes the active one; removing the active one makes the first remaining
  language active. Each change is saved at once.
- Below the slots, on a small desktop-like backdrop, the recording pill as it will look: dark
  glass with the aurora inside, 40 pt tall, a red dot, a waveform, the active language name and
  one dot per language. No language: no name. Clicking the name switches the preview's language,
  like the real pill.
- The name makes the pill wider, up to 180 pt of name; a longer name scrolls continuously to
  the left, or ends in an ellipsis with Reduce Motion. The pill's width animates when a
  language is added or removed.
- Caption: none chosen "Add a language, and the pill will show it while you record."; one
  "While recording, the pill shows the language."; two or more "While recording, press
  <Switch key> or click the name to switch language." (Switch key off: "Click the name on the
  pill to switch language.").

## Exercise page

- Title: the exercise name; subtitle "<Role> · exercise n of 2".
- Instruction line with inline key caps, for example "Press Fn, read the line, press Fn again."
  Translate exercise 1 shows a legend instead: "<keys> Start · <switch> Switch language ·
  <first key> Stop"; the Switch item is dimmed, with a tooltip, when fewer than two languages
  are chosen or the Switch key is off.
- Top card (96 pt): "Read this", "Say this in your own language, or anything you like"
  (Translate 1), "What happens" (Translate 2) or "Then say" (Ask 2), with the line. On success it
  turns into the result card ([states.md](states.md)).
- Text box (62 pt) where the text lands, focused. Translate 2 and Ask 2 use a 72 pt text block
  drawn as a paragraph that starts highlighted; the result replaces its text. Ask 1 has no box:
  the answer opens in the Ask window.
- Result line (44 pt): the state line.
- Footer: Back · Skip · Next (Finish on the last page).

## Adaptive lines

- Translate 1: first language English → the line is Cantonese, 早晨，我哋聽日下晝可唔可以見面？;
  any other first language → "Good morning, can we meet tomorrow afternoon?".
- Translate 2: first language English → 今天下午三点开会; otherwise "The meeting starts at three
  this afternoon.".
