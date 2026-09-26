# Pill

What the pill shows and how big it is. Back to [index](index.md).

## Sizes (the window adds 12 pt of padding on each side)

| State | Content | Width × height |
|---|---|---|
| Recording (Dictate, Ask) | dot or Ask icon, waveform, cancel | 160 × 40 |
| Recording (Translate) | dot, waveform, language name, dots, cancel | from the name, see below |
| Preparing, transcribing, polishing, pasting, done | label over the aurora sweep | 140 × 40 |
| Error / setup error | icon and one line (plus "Set up") | 224 / 320 × 40 |
| Copy pill | language tag, preview, Copy | 308 / 368 × 40 |

The aurora, the content cross-fade and the size animation of plan `copy-when-no-field` stay as
they are.

## Translate recording pill

```
 ●  ▁▃▅▂▆▃  Chinese (Traditional, Hong Kong)  ● ○ ○   ✕
 dot  wave   name (≤ 180 pt, click to switch)  dots   cancel
```

- Width = the fixed parts (padding, dot, waveform, cancel) + the name's width (at most 180 pt)
  + the dots (6 pt each, 4 pt apart), each with a 9 pt gap. Never narrower than the Dictate
  pill.
- The name is measured once per name, in the pill's own font (12 pt, medium). The same number
  sizes the pill and the native window, so they always agree.
- A name wider than 180 pt shows as a marquee: the name twice, 28 pt apart, moving left
  continuously at about 28 pt per second, with soft faded edges. With Reduce Motion it is cut
  with an ellipsis instead.
- Switching language changes the width: the new name fades in while the pill animates to its
  new width. The window grows first, or shrinks after the animation.
- With two or three languages the name is a button: a click moves to the next language (the
  same backend call as the Switch language key). The click never reaches the pill, where a click
  stops the recording, and the pill window never takes focus. Its accessible name says the
  language and "Click to switch language".
