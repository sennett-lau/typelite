# Speed board

Home gets a **Speed** board that shows where the wait goes between "I stopped talking" and "the
text is in my app", step by step, so users can see what to tune (model, server, language,
polish on/off).

Status: agreed — 2026-09-25

## Why it is needed

Speech recognition is not streaming. Typelite records until the user stops, then uploads the
whole clip, waits for the full transcript, and only then runs AI polish. Each step adds to the
wait, and which one dominates depends on the user's servers and models.

## Goals

- For every run, measure each step after the user stops speaking.
- Show the last run as a breakdown and recent runs as typical values, with a plain tip on what to
  change.
- Store no dictation content: only durations, sizes and which preset/model was used.

## Non-goals

- Usage counters (number of dictations, words, time saved).
- Streaming recognition (a separate, later plan if ever).

## Key decisions

| Decision | Reason |
|---|---|
| Timings are kept in memory only (last 50 runs), cleared when the app quits | Matches the no-history rule; nothing about dictations is written to disk. |
| Steps measured: finish recording, speech recognition, AI polish, paste; plus the recording length for context | These are the only places the user waits. |
| Show median of recent runs per preset/model, not averages | One slow cold start should not distort the picture. |
| Tips are rule-based, not AI-generated | Predictable and instant. |

## Parts

| File | Covers |
|---|---|
| [board.md](board.md) | What is measured and how the board looks. |

## Open questions

- None.
