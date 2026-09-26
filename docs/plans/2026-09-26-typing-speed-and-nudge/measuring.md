# Measuring speaking and typing speed

How the two numbers in the Insights row are measured and what is kept. Back to
[index](index.md).

## Speaking

After a Dictate or Translate run pasted its result (no error, not cancelled), the final text is
split into words with `CFStringTokenizer` (`kCFStringTokenizerUnitWord`). A token counts as a
word when it holds at least one letter or digit, so punctuation and spaces are skipped. Chinese
is segmented into words (a sentence becomes a few words, not one per character), and mixed
Cantonese and English text counts both parts. Other platforms fall back to whitespace words plus
one word per CJK character.

The word count and the recording length (seconds of audio sent for recognition) are added to
running totals: runs, words, minutes. The text itself is dropped at once.

Speaking WPM = words / minutes, shown once at least 10 s of speech were measured.

## Typing

The key listener (`native_hotkey.rs`) already sees every key event for the shortcuts. For each
key-down it also decides whether the key typed text:

- counted: letters, digits, punctuation, Space (by physical key position, so every layout and
  input method works; with a Chinese input method the pinyin keystrokes count);
- not counted: modifiers, arrows, Tab, Return, Delete, Escape, function and navigation keys,
  key repeats from holding a key, anything with ⌘ or ⌃ held, keys Typelite swallowed (its own
  shortcuts), and events Typelite sent itself (Type-directly output).

A counted key only tells a tracker "one keystroke now". The tracker groups keystrokes into
bursts: a gap over 2 s ends a burst, and a burst shorter than 5 s is ignored (a quick reply or
a stray key). A finished burst adds its keystrokes and its duration to the totals.

Typing WPM = (keystrokes / 5) / active minutes, shown once at least 1 minute of active typing
was measured. "Five keystrokes = one word" is the usual convention, and it works for every
language.

Password fields use macOS secure input, which hides key events from every listener, so they
are never counted.

## What is stored

`speed-stats.json` in the app data folder:

```
{ "version": 1,
  "speaking": { "runs": 12, "words": 830, "minutes": 5.8 },
  "typing":   { "keystrokes": 9120, "minutes": 38.0, "bursts": 64 },
  "nudge":    { "lastShownDay": "2026-09-26", "dismissed": false } }
```

Nothing else: no text, no key names or codes, no apps, no times of day. The log never names a
key either. "Reset speed stats" clears the speaking and typing totals.

## Permissions

The key listener is an active `CGEventTap`, which needs Accessibility; Typelite already asks
for it to paste and to swallow the End key. An active tap receives key-down events for all
apps, so no Input Monitoring permission is needed (macOS asks for that one only for listen-only
taps). Without Accessibility there is no listener: typing speed stays "—" and there is no
nudge; speaking speed still works.

## Considered

- Characters per minute for CJK: rejected; one unit for every language keeps the comparison
  simple.
- A separate listen-only tap for typing: rejected; it would need Input Monitoring.
