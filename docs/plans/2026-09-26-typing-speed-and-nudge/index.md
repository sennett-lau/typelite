# Typing speed and a typing nudge

Insights on Home opens with one row that compares how fast the user speaks with how fast they
type: "Speaking 142 WPM · Typing 48 WPM · 3.0× faster than typing". When the user types a lot
in another app, a small glass toast where the pill appears suggests the Dictate shortcut, at
most once a day. The visual reference is [mock.html](mock.html) (the "Speaking / Typing / N×
faster" row at the top of Insights, and the "Typing nudge" toast: switch it on in the mock).

Status: done — 2026-09-27

## Goals

- Show speaking speed and typing speed in the same unit (words per minute) for every language,
  so the gain from dictating is visible at a glance.
- Remind heavy typists that they can speak instead, without nagging.
- Store only running totals; never the dictated text and never which keys were pressed.

## Non-goals

- A typing test, per-app or per-day statistics, charts or history.
- Characters per minute for CJK (WPM is used for every language).
- Speed per preset (a possible later plan `speed-by-preset`).

## Key decisions

| Decision | Reason |
|---|---|
| Speaking words are counted with macOS word segmentation (`CFStringTokenizer`, word unit), skipping tokens without a letter or digit | It segments Chinese and mixed Cantonese/English text into words, so WPM means the same in every language. |
| Speaking WPM = total words / total recording minutes over every successful Dictate or Translate paste | A running average is steady; recording length is what the user spent speaking. |
| The final text is counted and dropped at once; only run count, word total and minutes are kept | No dictation content is stored (hard constraint). |
| Typing is measured from the existing key listener (a `CGEventTap` under Accessibility) | No new permission and no second listener. |
| Only key-downs that type text count: letters, digits, punctuation, Space; not modifiers, arrows, function keys, key repeats, shortcuts with ⌘ or ⌃, keys Typelite swallowed, or keys Typelite itself sent | Counts what the user types, not navigation, shortcuts or Typelite's own paste. |
| Typing counts gaps: a counted key within 2 s of the previous counted key adds one keystroke and that gap's time; a longer pause, and a lone key, add nothing. Typing WPM = (keystrokes / 5) / active minutes | Short replies, commands and fixes count too, pauses do not drag the number down, and the speed does not depend on how long a run is. "Five keystrokes = one word" is the standard. |
| Totals live in a small `speed-stats.json` in the app data folder, written by a background thread | Survives restarts; the key listener thread never touches the disk. |
| "Measure typing speed" (default on) and "Reset speed stats" sit in Settings → System → Insights, next to "Clear insights data" of plan `speed-by-preset` | The user decides, and every Insights data control is in one place; when off nothing is counted and there is no nudge. |
| With too little data the row shows "—" for speaking (under 10 s of speech) and a quiet grey "Keep typing…" for typing (under 30 s of counted typing; "—" while measuring is off), and hides the badge | A number from a few seconds would be misleading, and a bare dash on the typing side looked broken. |
| Each burst added to the totals writes one debug log line with only its keystroke count and seconds, from the background thread | The log shows that typing is measured without holding any content, and the key listener thread never touches the disk. |
| When the key listener cannot start (Accessibility missing, or stale after a rebuild), the shortcut supervisor retries until it works: after 1 s, doubling to 10 s; it stops when the app quits | A stale grant once left shortcuts and typing dead for hours after 3 quick retries; now they come back within about 10 s of the grant being fixed, without a restart. |
| The nudge is a pill state in the capsule window, so it appears where the pill does and never takes focus | Reuses the non-activating panel and its screen placement. |
| Nudge after about 60 s of mostly continuous typing (pauses under 5 s) in another app, at most once per local day, never during a run, before onboarding is finished, or while Typelite's own window has focus | Helpful at the right moment, never in the way. |
| The nudge offers "Don't show again" (kept in `speed-stats.json`) and ✕, and hides by itself after 8 s | Easy to silence for good. |

## Parts

| File | Covers |
|---|---|
| [mock.html](mock.html) | Interactive reference for the Insights row and the nudge toast. |
| [measuring.md](measuring.md) | How words and keystrokes are counted, the gap maths, what is stored and logged, permissions and the listener retry. |
| [nudge.md](nudge.md) | When the typing nudge shows, how it looks, and how it is dismissed. |

## Open questions

- None.
