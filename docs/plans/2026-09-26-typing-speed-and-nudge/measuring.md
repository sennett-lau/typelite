# Measuring speaking and typing speed

How the two numbers in the Insights row are measured, what is kept and logged, and how the key
listener gets started. Back to [index](index.md).

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

A counted key only tells a tracker "one keystroke now". The tracker counts the gaps between
counted keys: a key within 2 s of the previous counted key adds one keystroke and the time of
that gap. A longer pause is not typing time and adds nothing; the key after it starts a new
burst. So a lone key (a stray key, a one-letter answer) adds nothing, while a short reply or
command between pauses counts in full. A run of N keys adds N − 1 keystrokes over its N − 1
gaps, so the speed does not depend on how long a run is. A burst is added to the totals when
it ends: after a pause over 2 s (a background thread checks every second while one is open) or
when the app quits.

The keys that do not count (Delete, Return, arrows, shortcuts) are invisible to the tracker:
they add nothing and do not keep a burst open. A gap of up to 2 s with a correction in it still
counts as typing time, which is fair, since fixing typos is part of typing; a longer one is
skipped like any pause.

Typing WPM = (keystrokes / 5) / active minutes, shown once at least 30 s of active typing
(counted gaps) were measured. Until then Insights shows a quiet grey "Keep typing…" on the
typing side, or "—" while "Measure typing speed" is off. "Five keystrokes = one word" is the
usual convention, and it works for every language.

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

Nothing else: no text, no key names or codes, no apps, no times of day. "Reset speed stats"
clears the speaking and typing totals. Totals from the first version, which counted whole
bursts, stay valid: they hold one extra keystroke per burst, too little to need a migration.

## What is logged

Each burst added to the totals writes one debug line with only its keystroke count and seconds,
for example `Typing speed: 42 keystrokes in 9.8s added`. The background thread writes it (the
log file is on disk, and the key listener thread never touches the disk). A lone key logs
nothing. The log never names a key.

## Permissions

The key listener is an active `CGEventTap`, which needs Accessibility; Typelite already asks
for it to paste and to swallow the End key. An active tap receives key-down events for all
apps, so no Input Monitoring permission is needed (macOS asks for that one only for listen-only
taps). Without Accessibility there is no listener: nothing is counted, so typing keeps its
"Keep typing…" hint, and there is no nudge; speaking speed still works.

The listener's event tap cannot be created while the grant is missing, or stale after a rebuild
(macOS ignores the old grant although it still shows "on"). The shortcut supervisor therefore
retries the registration until it works, with a growing wait: 1 s, 2 s, 4 s, 8 s, then every
10 s. Shortcuts and typing measurement come back within about 10 s of the grant being fixed,
without a restart. A failed attempt is logged as a warning the first time at each wait step and
at debug level after that, so hours without the grant do not flood the log; the attempt that
works is logged too. The retry loop stops when the app quits.

## Considered

- Characters per minute for CJK: rejected; one unit for every language keeps the comparison
  simple.
- A separate listen-only tap for typing: rejected; it would need Input Monitoring.
- Whole bursts of at least 5 s, shown after 1 minute (the first version): rejected after real
  use. Someone who dictates anything long mostly types short replies, commands and fixes, which
  rarely made a 5 s burst, so a day of typing gave 2 bursts and 13 s, and Insights still showed
  "—". It also counted N keystrokes over only N − 1 gaps, which overstated the speed a little.
- Counting Delete, Return or arrows, or letting them keep a burst open: rejected; they edit
  and move rather than type text.
- Giving up after 3 quick retries when the listener cannot start: rejected; a stale grant then
  left shortcuts and typing dead until the app restarted.
