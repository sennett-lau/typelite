# Board

Back to [index](index.md).

## Measured per run (Dictate, Translate, Ask)

All times start when the user presses the shortcut to stop (or releases it in hold mode).

| Step | From → to |
|---|---|
| Finish recording | stop pressed → audio encoded and ready to send |
| Speech recognition | request sent → transcript received (upload + server work + reply) |
| AI polish (or translate / answer) | request sent → full response received; "skipped" when polish is off or AI is not ready |
| Paste | response ready → text inserted into the app |
| **Total** | stop pressed → text inserted |

Also recorded for context: recording length (seconds of audio), audio size, mode, speech preset
and model, AI preset and model, and the language setting. Never the audio or any text.

## On Home

- **Last run:** a horizontal stacked bar, one coloured segment per step with its time, and the
  total ("1.9 s from stop to text"). Recording length shown beside it ("for 4.2 s of speech").
- **Typical:** median time per step over recent runs with the current presets, as small rows
  with a mini bar each, plus how many runs it is based on.
- **Tip:** one line based on the largest step, for example:
  - Speech > 60 % of total: "Speech recognition is the slow part. A GPU server or a fixed
    language is faster; see the speech guide."
  - AI > 50 %: "AI polish is the slow part. Try a smaller model or a server with a GPU."
  - Paste > 300 ms: "Pasting is slow; try switching text output to Type directly."
- Empty state: "Dictate once to see where the time goes."
- Colours follow the step, not the feature: recording grey, speech the accent, AI violet, paste
  green, in both light and Aurora dark.

## In Settings

The Speech and AI Test buttons keep showing their own round-trip time. Their help text says
what the number includes ("upload, recognition of a short test clip, and the reply").
