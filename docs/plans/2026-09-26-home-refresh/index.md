# Home refresh

Home gets a clearer first screen: the app icon next to the name in the sidebar, a short headline,
shortcut tiles that show only what to press, and the Speed board renamed to **Insights**, which
now shows the average run across every preset instead of the last run and per-preset medians.
The visual reference is [mock.html](mock.html) (it also shows the speaking/typing row of plan
`typing-speed-and-nudge` and the preset comparison of plan `speed-by-preset`, which are built
separately).

Status: building — 2026-09-26

Supersedes in part [speed-board](../2026-09-25-speed-board/index.md): the board no longer shows
the last run or medians for the current presets, and the Finish recording step is no longer
shown. What is measured and how it is kept stay as `speed-board` describes them.

## Goals

- The sidebar shows the Typelite icon, so the window is recognisable at a glance.
- The top of Home says what the app does in one line.
- A shortcut tile answers one question: which keys do I press?
- Insights gives one number the user can remember: how long it usually takes from stop to text.

## Non-goals

- Changing Finish setup, the tour link, Your setup or What's New.
- Comparing presets, or keeping timings across restarts (plan `speed-by-preset`).
- Speaking and typing speed (plan `typing-speed-and-nudge`).

## Key decisions

| Decision | Reason |
|---|---|
| Sidebar brand: the app icon (`src/assets/typelite-icon.png`, a copy of the 64 px bundle icon) at 28 pt with 7 pt corners, then "Typelite" in 18 pt bold | The icon is the one users see in the Dock; 64 px stays sharp at 28 pt on Retina. |
| Headline "Just say it." at 26 pt bold, subtitle "Press a shortcut anywhere, speak, and clean text lands where you're typing." | Says the whole product in two lines; replaces "Welcome to Typelite", which said nothing. |
| Tiles: icon and name on the first row, key caps on the second; no description, no Switch language hint | What each shortcut does is explained in Settings → General and in the tutorial; the tile is a reminder of the keys. |
| Extra shortcut rows (edit selection, switch prompt preset, open app) keep their description | They are rare and not taught in the tutorial. |
| Insights shows the mean of every finished run, whatever preset it used | One stable "usual wait"; per-preset numbers belong to the comparison in plan `speed-by-preset`. |
| Failed runs are left out; each step is averaged only over the runs where it ran | An Ask answer has no paste and polish-off runs have no AI; counting them as zero would hide the real step time. |
| Three steps: speech recognition, AI polish, paste; the total is the sum of the three averages | Finish recording is a short fixed cost the user cannot tune; a total that equals the bar avoids two numbers that disagree. |
| The AI step is always called "AI polish" | The average mixes Dictate, Translate and Ask runs. |
| Keep the slowest-step tip, computed from the averages | It is the one actionable line on the board. |
| The component keeps its file name (`SpeedBoard.tsx`) and the `home.speed.*` text keys | Smaller diff while other work on Insights is in flight. |

## Considered

- Keep the last run next to the average: dropped, two bars with different numbers confuse more
  than they help.
- Median instead of mean: dropped for this view, the agreed design asks for the average; a slow
  first run after a model load is handled in plan `speed-by-preset`.

## Parts

| File | Covers |
|---|---|
| [home.md](home.md) | The layout of Home from top to bottom and how Insights computes its numbers. |
| [mock.html](mock.html) | The agreed visual reference. |

## Open questions

- None.
