# Tutorial: one short page at a time

The shortcut part of onboarding stops being three long, scrolling steps. Each shortcut gets a
setup page (only its keys, and for Translate its languages), followed by one page per exercise.
Every onboarding page shows its title and content as one block, centred between the step dots
and the footer, so nothing scrolls at the default window size. An exercise page keeps every
element in a fixed slot, and its result appears only once the pasted text has fully arrived.
The visual reference is [mock.html](mock.html).

Status: done — 2026-09-26

Supersedes in part [guided-tutorial](../2026-09-25-guided-tutorial/index.md) (the exercise card,
the before/after panel and the in-card buttons) and the default language of
[translate-controls](../2026-09-25-translate-controls/index.md) (English by default). The
exercises, their scripts and their forgiving checks stay as `guided-tutorial` describes them.
The pill preview follows the pill design of plan `translate-pill-and-keys`.

## Goals

- One idea per page: set the keys, then try one behaviour.
- No onboarding page scrolls at the default 900 × 700 window; a smaller window scrolls the block
  from its top.
- Nothing on an exercise page moves between its states (ready, listening, writing, result).
- The success message never shows while text is still being typed into the box.
- Translate starts with no language; the user picks the ones they want and sees how the pill
  will show them.

## Non-goals

- A recording-mode choice in onboarding. Onboarding teaches press to start, press again to stop;
  hold-to-talk stays in Settings → General.
- Changing the real pill; plan `translate-pill-and-keys` owns it. The onboarding preview is a
  static copy of its design.
- New exercises or new checks.

## Key decisions

| Decision | Reason |
|---|---|
| Title and content form one block with 22 pt between them, centred vertically and horizontally between the dots and the footer (`margin-block: auto` in a scrolling column) | Short pages sit in the middle; a tall page starts at the top and scrolls instead of being cut off. |
| Shortcut part = per role: a setup page, then one page per exercise (2 each); the step dots count these pages | Short pages that each fit the window; the dots show real progress. |
| Setup page: large key caps (click to record) and one hint line; footer Back · Try it | The only decision on the page is the keys. |
| Translate hints name each key by its job ("While recording, Fn stops") | The first key of the Translate shortcut stops, the Switch language key switches. |
| New installs start with no translation language; existing configs keep theirs | Nobody gets a language they did not pick; "Try it" waits until one is added. |
| "Translate into" is three slots in one row: numbered when there are two or more, the first empty slot is a dashed "+ Add", ✕ removes | All three places are visible; the order is the switch order. |
| A static pill preview under the slots: dark glass with the aurora inside, 40 pt tall, red dot, waveform, active language name, one dot per language | The user sees what the pill will show before recording. |
| The preview grows with the name up to 180 pt of name, then scrolls it as a continuous marquee to the left; plain ellipsis with Reduce Motion; its width animates when languages change | Long names stay readable without an ever-growing pill. |
| Exercise page: title = exercise name, subtitle "<Role> · exercise n of 2", one instruction line with inline key caps (Translate 1: a Start · Switch language · Stop legend) | The keys are read in the sentence that uses them. |
| Fixed slots: top card 96 pt, text box 62 pt (selection exercises: a 72 pt text block), result line 44 pt | Nothing moves when the state changes. |
| The selection exercises use a text area drawn as a plain paragraph, not a truly read-only element | The pipeline only pastes into a focused field whose value can be set (plan `copy-when-no-field`); a read-only paragraph would get the Copy pill instead. |
| Success card uses the primary accent colour, shows ✓ and what changed (removed words struck through, or "original → result") and the box border turns accent | Matches the rest of the app; the change is the lesson. |
| "Not quite" and "Didn't catch that" are one inline line with an ⓘ and a Try again link | The page keeps its size; Try again is where the eye already is. |
| The footer holds Back · Skip · Next (Finish on the last page); Next unlocks after a success, Skip always works | Navigation lives in one place on every page. |
| The result is decided after the pipeline's insert result and once the box holds all inserted characters (or stopped changing) | `pipeline:insert_result` is sent once the paste was sent, but the keystrokes can still be arriving in the box. |
| The Translate lines adapt to the first language: an English target gets Cantonese (speech) and Chinese (selection) lines, every other target English ones | The translation must look different from what was said. |

## Considered

- A recording-mode switch on each setup page: dropped, one more decision for a first run.
- A read-only paragraph for the selection exercises: dropped, see the key decision above.
- A default English target: dropped, the user asked to start empty.

## Parts

| File | Covers |
|---|---|
| [pages.md](pages.md) | The layout and every page: setup pages, Translate languages and pill preview, exercise pages. |
| [states.md](states.md) | Exercise page states, when a result is decided, and what the result card shows. |
| [mock.html](mock.html) | The agreed visual reference. |

## Open questions

- What the Translate shortcut should do when a user has no language at all (they skipped the
  tutorial and never added one in Settings). Today it polishes without translating.
