# Translate pill and keys

The Translate recording pill shows the active language by name instead of one chip per
language, grows with that name, scrolls a name that is too long, and switches language when the
name is clicked. Every pill is a little taller. During a Translate recording the keys are clear:
the Translate shortcut's first key stops, the Switch language key switches. The visual reference
is the pill preview on the "Translate · shortcut" page of [mock.html](mock.html).

Status: done — 2026-09-26

Pill height superseded by [compact-pill](../2026-09-26-compact-pill/index.md) (32 pt).

Changes decisions in earlier plans:
- [aurora-pill](../2026-09-25-aurora-pill/index.md): the pill is 40 pt high (was 36) with more
  inner padding, and the Translate recording pill no longer shows three chips.
- [translate-controls](../2026-09-25-translate-controls/index.md): the pill shows the active
  language's name and one dot per language instead of one chip per language; stopping a
  Translate recording with the first key of its shortcut is now an explicit rule, not a side
  effect of that key also being the Dictate key.

## Goals

- The user always reads which language they are translating into, in full words.
- A long language name never breaks the pill: it grows up to a limit, then scrolls.
- Start, switch and stop a Translate recording with keys the user can predict.

## Non-goals

- More than three languages, or new languages.
- Changing the Dictate or Ask pills beyond the shared height and padding.
- Stop keys for Dictate or Ask (their shortcut pressed again already stops them).

## Key decisions

| Decision | Reason |
|---|---|
| Every pill state is 40 pt high, with 14 pt padding on the left and 12 pt on the right | The agreed mock; the 36 pt pill felt cramped. |
| Translate recording pill: red dot, waveform, the active language's name, one small dot per language (filled = active), cancel | Option "B" of the mock: a name reads faster than a chip glyph. |
| One language: name only, no dots. No language: no name | Dots only help when there is something to switch to. |
| The name area grows the pill up to 180 pt; a wider name scrolls as a continuous marquee to the left | Short names get a short pill, long names stay readable. |
| Scroll or not is decided by the name's natural width against the fixed 180 pt limit, never by the pill's width at that moment | The pill's width animates; judging by it would flicker between the two. |
| Marquee: two copies with a 28 pt gap, linear, about 28 pt per second | Continuous and calm, as in the mock. |
| Reduce Motion: the long name ends with an ellipsis and does not move | Accessibility. |
| Width changes animate over 0.28 s with the same ease as other states; the window grows before the pill animates wider and shrinks after it animated narrower | Same rule as plan `copy-when-no-field`; nothing is clipped and nothing jumps. |
| Clicking the name moves to the next language, exactly like the Switch language key, without stopping the recording or taking focus | One more way to switch; the pill is already a non-activating panel. |
| During a Translate recording a press of the Translate shortcut's first key on its own stops it | The user learns one stop key; it works even when that key is no shortcut by itself (Ctrl of Ctrl+Alt+T). |
| The Switch language key switches, and pressing the whole Translate shortcut again still stops, in either key order | Keeps today's behaviour. |
| When the first key is the Switch language key, the key switches (the whole shortcut still stops) | The user chose it as the switch key on purpose. |

## Parts

| File | Covers |
|---|---|
| [pill.md](pill.md) | Pill layout, sizes, marquee, click to switch, window resize order. |
| [keys.md](keys.md) | Which keys stop and switch during a Translate recording, and how the key listener does it. |
| [mock.html](mock.html) | Interactive reference (the "Translate · shortcut" page, option B). |

## Open questions

- None.
