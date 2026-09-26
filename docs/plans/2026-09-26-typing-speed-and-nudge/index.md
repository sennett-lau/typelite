# Typing speed and a typing nudge

Insights on Home opens with one row that compares how fast the user speaks with how fast they
type: "Speaking 142 WPM · Typing 48 WPM · 3.0× faster than typing". When the user types a lot
in another app, a small glass toast where the pill appears suggests the Dictate shortcut, at
most once a day. The visual reference is [mock.html](mock.html) (the "Speaking / Typing / N×
faster" row at the top of Insights, and the "Typing nudge" toast: switch it on in the mock).

Status: done — 2026-09-26

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
| Typing is grouped into bursts: a gap over 2 s ends a burst, bursts under 5 s are ignored; typing WPM = (keystrokes / 5) / active minutes | The standard "five keystrokes = one word"; pauses and single shortcuts do not drag the number down. |
| Totals live in a small `speed-stats.json` in the app data folder, written by a background thread | Survives restarts; the key listener thread never touches the disk. |
| "Measure typing speed" (Settings → General, default on) and "Reset speed stats" | The user decides; when off nothing is counted and there is no nudge. |
| The row shows "—" for a side with too little data (under 10 s of speech, or under 1 min of active typing) and hides the badge | A number from a few seconds would be misleading. |
| The nudge is a pill state in the capsule window, so it appears where the pill does and never takes focus | Reuses the non-activating panel and its screen placement. |
| Nudge after about 60 s of mostly continuous typing (pauses under 5 s) in another app, at most once per local day, never during a run, before onboarding is finished, or while Typelite's own window has focus | Helpful at the right moment, never in the way. |
| The nudge offers "Don't show again" (kept in `speed-stats.json`) and ✕, and hides by itself after 8 s | Easy to silence for good. |

## Parts

| File | Covers |
|---|---|
| [mock.html](mock.html) | Interactive reference for the Insights row and the nudge toast. |
| [measuring.md](measuring.md) | How words and keystrokes are counted, the burst maths, what is stored, permissions. |
| [nudge.md](nudge.md) | When the typing nudge shows, how it looks, and how it is dismissed. |

## Open questions

- None.
