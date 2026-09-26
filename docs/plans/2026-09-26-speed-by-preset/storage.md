# Timings file

Where run timings are kept, what a record holds and how the file is read, written and deleted.
Back to [index.md](index.md).

## Location and format

`run-timings.json` in the app data folder (next to the dictionary database), written by
`timing.rs`:

```json
{ "version": 1, "runs": [ { "id": 41, "mode": "dictate", "recordingSecs": 4.2, ... } ] }
```

Runs are oldest first, at most 200 (`RUN_TIMING_CAPACITY`).

## What a record holds

- `id`, `mode` (dictate, translate, ask), `outcome` (`ok` or an error code).
- Durations in ms: finish recording, speech, AI (or none), paste (or none), total.
- Sizes: seconds of audio and bytes uploaded.
- `speechPresetId`, `speechModel`, `aiPresetId`, `aiModel`, and the speech language setting.

Never audio, transcripts, AI answers, pasted text, app names or window titles. This is what the
"no history" promise means: Typelite keeps no record of what was said; it keeps how long things
took.

## Lifecycle

- **Start:** the file is read once. A missing file is an empty list. A file that cannot be read
  or parsed is logged and ignored; the next run replaces it. A file with more than 200 runs keeps
  the newest 200. Ids continue from the highest kept id.
- **Each run:** the record is added (the oldest dropped when full), the file is written to
  `run-timings.json.tmp` and renamed over the old one. A write error is logged and the run stays
  in memory.
- **Clear insights data** (Settings → System): forgets every kept run and deletes the file. The
  row confirms with "Cleared", or says it could not clear the data.
- **Quit:** nothing to do; the file is already current.

Missing fields read as defaults and unknown fields are ignored, so files from other versions
load.
