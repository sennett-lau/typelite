# Exercises

Back to [index](index.md). Each exercise: record/test the shortcut as today, then a card with
the script, a practice box (where text is pasted), and a before/after panel ("You said" = raw
transcript, "Typelite wrote" = final text).

## Step 5 — Dictate

1. **Change of mind.** Script: *"Let's have lunch at 1… oh no, let's do it at 2."*
   Expected: "Let's have lunch at 2." Success: the pasted text contains "2" and not "at 1".
   Caption after success: "Typelite kept only your correction."
2. **Fillers.** Script: *"Um, so, I think we should, like, ship it on Friday."*
   Expected: "I think we should ship it on Friday." Success: text pasted and contains "Friday".
   Caption: "Fillers like um and like are removed."

## Step 6 — Translate

1. **Speak and translate.** The step first asks for the target language (English preselected,
   one of the user's languages). Script: *"Good morning, can we meet tomorrow afternoon?"*
   (Chinese UI: *"早上好，我们明天下午可以见面吗？"*). Expected: the sentence in the target
   language. Success: text pasted and it differs from the raw transcript. When the line was
   already said in the target language (English script, English target) it cannot differ, so
   the paste alone counts, and a hint suggests reading it in another language or picking
   another target.
2. **Highlight and translate.** The practice box is pre-filled with a sentence in a different
   language from the target (for an English target: *"今天下午三点开会"*; otherwise
   *"The meeting starts at three this afternoon."*). Instruction: "Select the text above, press
   Translate, then press it again without speaking." Expected: the selection is replaced by its
   translation. Success: the box text changed and is in the target language.
3. If the user has two or more languages, a hint shows the Switch language key.

## Step 7 — Ask anything

1. **Ask a question.** Script: *"What is fifteen percent of two hundred forty?"* Expected answer
   panel with "36". Success: an answer appeared.
2. **Edit a selection.** The practice box is pre-filled with *"Hey, just checking whether you
   had a chance to look at the draft I sent over last week, no rush at all."* Instruction:
   "Select it, press Ask, and say: make this shorter." Expected: a shorter sentence replaces the
   selection. Success: the text changed and is shorter. Ask on a selection answers in the Ask
   panel today (it replaces the selection only for "translate this into …"), so a shorter
   answer in the panel counts as well.

"In the target language" is a script-level check (Latin, Han, kana, Hangul, Cyrillic, …), so
languages that share a script (English and French) only need the text to have changed.

## Shared behaviour

- "Try again" resets the exercise; "Skip this exercise" moves on without marking it done.
- A step is complete when its exercises are done or skipped; Finish stays available at the end.
- Pre-filled boxes are focused and selected when the card appears, and the instruction asks
  the user to keep the text selected (or select it again).
- The raw transcript for the before/after panel is shown only on this screen and discarded
  when the step changes; nothing is stored.
