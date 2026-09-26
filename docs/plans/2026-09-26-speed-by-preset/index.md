# Speed by preset

Insights on Home gets a **Compare presets** section that ranks the user's AI presets by how long
AI polish takes and their speech presets by how long recognition takes per second of audio. To
have enough runs to compare, run timings are now kept across restarts in a small file in the app
data folder (the last 200 runs), and Settings → System gets **Clear insights data** to delete
it. The visual reference is [mock.html](mock.html).

Status: building — 2026-09-26

Supersedes in part [speed-board](../2026-09-25-speed-board/index.md): its decision "timings are
kept in memory only (last 50 runs)" becomes "the last 200 runs are kept in a file". Builds on
[home-refresh](../2026-09-26-home-refresh/index.md), which made the board into Insights.

## Goals

- Answer "which of my presets is faster?" with numbers from the user's own runs.
- Keep enough runs, across restarts, for that answer to mean something.
- Let the user delete the data in one click.

## Non-goals

- Storing anything the user said. The "no history" promise is about content: no audio, no
  transcripts, no answers, no pasted text, and that does not change.
- Benchmarks or test runs made on purpose; only real runs count.
- Comparing prompt presets or per-app behaviour.

## Key decisions

| Decision | Reason |
|---|---|
| Keep the last 200 runs in `run-timings.json` in the app data folder, loaded at start | 50 runs in memory were gone at every restart, too few to compare several presets. |
| A record holds durations, sizes, preset ids and models, mode, outcome and speech language only | These are timings, not content; the "no history" promise stays true. |
| The file is rewritten after each run through a temporary file and a rename | Small (tens of KB); a crash never leaves half a file. |
| An unreadable or corrupt file is ignored and replaced by the next run | Insights is a convenience; it must never stop the app from starting. |
| Missing or unknown fields in a record read as defaults | Files from older or newer versions still load (other plans add fields to the record). |
| "Clear insights data" in Settings → System deletes the file and the kept runs | One obvious place to remove the data. |
| "Compare presets" is collapsed by default and opens with a height animation | The average stays the headline; the comparison is for the curious. |
| AI presets compare average AI time; speech presets compare recognition time per 1 s of audio | AI time barely depends on recording length; recognition time grows with it, so per-second is fair. |
| Group by preset id and model; the name is looked up by id, "Deleted preset" when it is gone | A preset whose model changed is a different speed; renaming a preset keeps its history. |
| A preset needs 3 finished runs to be ranked; with fewer it is listed with "—" | One or two runs say too little; listing them shows that data is coming. |
| Averages are trimmed means: the slowest run in every ten (at least one from three runs) is dropped | The timing records cannot tell whether a model was loaded during a run (a server loads models out of our sight), so the slow first run after a load is removed this way. Only the slow end is trimmed, since a load only makes a run slower. |
| "Fastest" tags the lowest average when at least two presets are ranked | A single preset is not "fastest" of anything. |

## Considered

- Flag the first run after a model load and leave it out: dropped, only the built-in engines
  could report it, and the built-in speech model is often preloaded while the user is still
  talking, so even there the flag would be unreliable.
- Median instead of a trimmed mean: dropped, the agreed design shows averages; the trimmed mean
  stays close to the average while ignoring cold starts.
- Keep timings in memory and add a "keep across restarts" switch: dropped, one more setting for
  data that holds no content; Clear insights data covers the wish to remove it.

## Parts

| File | Covers |
|---|---|
| [storage.md](storage.md) | The timings file: what it holds, when it is written, read and deleted. |
| [comparison.md](comparison.md) | How the comparison groups, averages and ranks presets, and how it looks. |
| [mock.html](mock.html) | The agreed visual reference. |

## Open questions

- None.
