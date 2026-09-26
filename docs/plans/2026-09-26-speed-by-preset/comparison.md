# Preset comparison

How "Compare presets" in Insights groups, averages and ranks presets, and how it looks. Back to
[index.md](index.md).

## Layout

Under the average bar of Insights, above the tip:

```
› Compare presets                              (collapsed by default)

AI POLISH                                  SPEECH RECOGNITION (per 1 s of audio)
Fast server · qwen3:4b  Fastest 26 runs ▇▇▇  0.42 s    Built-in · large-v3-turbo  Fastest 30 runs ▇▇ 0.27 s
Laptop · Qwen3 1.7B     8 runs  ▇▇▇▇▇  0.61 s          Server · whisper          8 runs ▇▇▇ 0.31 s
Deleted preset · x      2 runs          —
Averages of runs that finished, over the last 200 runs. A preset needs 3 runs before it is
ranked, and its slowest run in every ten is left out, so a model loading does not count. Speech
time is per second of audio so long and short recordings compare fairly.
```

- The button shows a chevron that turns 90° when open and has `aria-expanded`. The panel opens
  and closes with a height animation (a grid row from `0fr` to `1fr`, 0.28 s, none with Reduce
  Motion) and is `inert` while closed, so its contents are not reachable by keyboard.
- Two columns: AI polish (AI step colour) and speech recognition (speech step colour).
- A row: "<preset name> · <model>", a "Fastest" tag, the run count, a bar scaled to the slowest
  ranked average, and the average in seconds with two decimals.
- An empty list says "No finished runs yet."

## Numbers

- Only runs with outcome `ok` count.
- **AI list:** runs where AI ran (any mode), grouped by AI preset id and model; the value is the
  AI time in ms.
- **Speech list:** runs with a known audio length, grouped by speech preset id and model; the
  value is speech time divided by seconds of audio.
- **Average:** the trimmed mean of a group's values: sort, drop the slowest `max(1, ⌊n / 10⌋)`
  values, take the mean of the rest.
- **Ranking:** groups with at least 3 runs are ranked by average, fastest first; the rest follow,
  most runs first, with "—" and no bar.
- **Fastest:** the first ranked group, when at least two are ranked.
- **Name:** the preset with that id in the current settings (its name, or "Untitled preset" when
  empty); "Deleted preset" when there is none.
