# Home layout and Insights

What Home shows, top to bottom, and how the Insights numbers are made. Back to
[index.md](index.md).

## Sidebar

The brand row at the top of the sidebar: the app icon (28 × 28 pt, 7 pt corner radius) and
"Typelite" in 18 pt bold, 9 pt apart. The icon is decorative (`alt=""`); the name is the text.

## Page, top to bottom

1. **Headline**: "Just say it." (26 pt bold) and the subtitle "Press a shortcut anywhere, speak,
   and clean text lands where you're typing." Chinese: "说出来就好。" and
   "在任何地方按下快捷键说话，整洁的文字就会出现在你正在输入的地方。"
2. **Finish setup** rows, unchanged, only while speech or AI is not ready.
3. **Shortcut tiles** for Dictate, Translate and Ask anything, three in a row. Each tile: the
   coloured feature icon and the name on one line, the key caps (or "Not set") below. A click
   opens Settings → General. Extra shortcuts appear as rows under the tiles only when bound,
   unchanged.
4. **Tour link**, unchanged.
5. **Insights** (see below).
6. **Your setup** and **What's New**, side by side, unchanged.

## Insights

```
INSIGHTS
Average   38 runs across all presets              3.1 s from stop to text
[████████ speech ████████|██ AI ██|██ paste ██]
● Speech recognition 1.9 s   ● AI polish 600 ms   ● Paste 600 ms
Tip: Speech recognition is the slow part. …  See the speech guide
```

- Runs come from the backend's timing records (`timing.rs`, plan `speed-board`): the kept runs
  when Home opens, then one `timing:run` event per run.
- Only runs whose outcome is `ok` count. The run count is the number of those runs.
- Each step's value is the arithmetic mean over the finished runs that had the step. A step no
  finished run had shows "—" and draws no segment.
- The total is the sum of the three step averages; the bar's segments are drawn against it.
- The tip uses the rules of `speed-board` (speech over 60 % of the total, AI over 50 %, paste
  over 300 ms with clipboard output) on the averages.
- With no runs the board says "Dictate once to see where the time goes."; with runs but none
  finished it says that no run has finished yet.
