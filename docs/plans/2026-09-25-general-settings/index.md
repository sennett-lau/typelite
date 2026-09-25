# General settings — Shortcuts, Recording, Output

Settings → General is regrouped into three groups that match the rest of Settings: **Shortcuts**
(all five, each with a one-line description and its keys drawn as key caps), **Recording** (how
the shortcut starts and stops, microphone, live input level, mute other audio) and **Output**
(paste or type). It is a regrouping and restyling of settings that already exist; no new
backend behaviour. Open [mock.html](mock.html) and pick "Settings → General" for the exact look.

Status: building — 2026-09-25

## Goals

- One screen that explains every shortcut in plain words and shows its keys the way Home does.
- Recording and output choices read as sentences ("Start and stop", "Put text in the app by").
- Same visual language as Settings → Speech and AI (groups, rows, segmented options, toolbar tabs
  from two-tab-speech).

## Non-goals

- New settings or backend changes. Only what the config and backend already support is shown.
- Changing defaults (the default output stays what it is today).
- Launch at login and Show in Dock: they stay in Settings → System, where they already live.
- Onboarding: the shortcut and microphone steps keep their current look.

## Layout

```
SHORTCUTS                         Click a shortcut, then press the keys
  Dictate          Speak and paste polished text          [Fn]            + 
  Translate        Speak and paste it in English          [Fn][Left Shift] +
  Switch language  While translating, next language       [Shift]  (reset)
  Ask anything     Ask a question, or edit selected text  [Fn][Space] (Try) +
  Cancel           Stops a recording or run               [Esc]   (read-only)
RECORDING
  Start and stop   Dictate and Translate shortcuts   (Press to start, press to stop | Hold to talk)
  Microphone       [picker] (refresh)
  Input level      ▮▮▮▯▯▯
  Mute other audio while recording                                       (switch)
OUTPUT
  Put text in the app by   Pasting is faster; typing works where paste is blocked
                                                               (Pasting | Typing)
```

## Key decisions

| Decision | Reason |
|---|---|
| Three groups: Shortcuts, Recording, Output (replacing Shortcuts, Audio, Dictation) | Matches the mock; "Dictation mode" is about recording, output mode is about output. |
| Shortcut rows use the Home names (Dictate, Translate, Ask anything) with a short description | Same words everywhere; the description says what the shortcut does. |
| Shortcut keys are drawn as key caps inside the clickable recorder field; the field keeps the text for screen readers | Matches the mock and Home, and the field still says "click me". |
| Extra bindings (up to three), the ⋯ menu, + add and Try Ask stay | Existing features; the redesign must not drop them. |
| Switch language keeps its reset button and shows only on macOS | As today (translate-controls). |
| Cancel is a read-only row showing Esc | Escape is fixed in pill-follows-cursor-and-escape; nothing to configure. |
| "Start and stop" maps to the existing `hotkey_mode` (`toggle` / `hold`); toggle is listed first | Both modes exist in the backend and apply to Dictate and Translate. |
| The existing microphone picker and its level meter are reused unchanged, with the row label "Microphone" | The meter already runs in Settings while idle; no new code path. |
| "Pasting" is `output_mode: clipboard` + `insertion_strategy: clipboardPaste`; "Typing" is `keyboard` + `auto` | The same mapping the old control used, so saved configs read back the same. |
| Group-header hint uses the group's action slot in normal case | The header style is shared; no new component. |
| Hotkey warnings (conflict, registration failure, Wayland) stay in the Shortcuts group | They are about shortcuts. |

## Considered

- A separate always-on level meter outside the picker: not needed, the picker already has one.
- Bare key caps without a field: harder to see that a row is clickable to record.

## Parts

| File | Covers |
|---|---|
| [mock.html](mock.html) | Visual reference; choose "Settings → General". |

## Open questions

- The app's default output is Typing (`keyboard`), while the product's target UX is paste. Should
  the default change? Out of scope here.
