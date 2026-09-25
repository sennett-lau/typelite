# Changes

New tab layout and what goes away. Back to [index](index.md).

## Main tabs (sidebar)

1. **Home**
2. **Settings** — General, Speech recognition, AI polish, Prompt Presets, System
3. **Dictionary** — the current Dictionary screen (Words and Corrections), moved out of Settings

Pinned to the bottom of the sidebar, apart from the three tabs: **About** — the current About
screen (description, UI language, licence, GitHub link, framework), moved out of Settings.

## Home

- **Header:** "Welcome to Typelite".
- **Shortcuts panel** directly under it, replacing the single "Use … to start voice recording"
  sentence: one row per feature, each with its name, what it does in a few words, and its
  current keys drawn as key caps (for example Dictate — "Speak and paste polished text" —
  `Fn`; Translate — `Fn` `Shift`; Ask anything — `Fn` `Space`). The rows always show the live
  bindings, and clicking the panel opens Settings → General → Shortcuts.
- **Current configuration:** microphone, active speech preset and model,
  active AI preset and model, AI polish on/off, text output mode. Each row links to the setting
  that changes it.
- **What's New:** the changes in the current version, newest first, from a small list shipped
  with the app. First entry, version 0.1.0: Typelite rename, speech and AI presets, microphone
  picker, press-keys shortcut recording, live waveform, three translation languages, new setup
  tutorial, Native Glass look, no history.
- Removed: total recordings, today's count.

## History (removed)

- The History tab, its page and route.
- Stored history: the history table in `typelite.db` is dropped at startup; no code writes
  dictation text, audio or metadata to disk.
- Settings → General → "Save history" toggle and its config field.
- History commands and events, and features built only on history (for example "Create
  correction" from a history entry, history-based counters).
- Logs never contain transcript or answer text.
- Anything that needs the last result (for example "Last dictation context" or retry) keeps it
  in memory only, and it is gone when the app quits.

## Prompt Presets (renamed from Scenes)

- Settings section, page title, buttons and messages say "Prompt Presets" / "prompt preset"
  instead of "Scenes" / "scene". Chinese text is updated to match.
- Behaviour is unchanged: saved AI writing prompts (built-in and your own), one can be active,
  plus "App writing modes" that pick a default prompt per app type.
- Layout: two sub-tabs at the top of the screen instead of one long scroll.
  - **Prompts** (first, selected by default): built-in and custom prompt presets, with new,
    import/export, edit, duplicate, activate, delete.
  - **Apps**: the list of app types, each with the prompt preset it uses by default.
  The chosen sub-tab is remembered while the window is open.

## Settings → General (clearer groups)

Each group is its own card with a heading and spacing between cards, instead of one long list:
**Shortcuts**, **Audio**, **Dictation mode**, **Text output**. The old "More settings"
group is gone: launch at login moves to System, the history toggle goes with history, and
"Hide capsule when idle" is removed. The capsule is always hidden when idle and shows only while
recording, working, or showing an error. Its idle right-click menu goes with it; the menu-bar
icon offers the same items.

## Settings → System (new)

- **Launch at login** (moved from General; same autostart setting as today).
- **Show in Dock** (new, on by default). Off switches the app to macOS "accessory" mode: no Dock
  icon and no app menu, only the menu-bar icon, which still opens the main window. Applied at
  startup and immediately when toggled.

## Settings → General → Audio

Renamed from "Microphone". Contains the microphone picker with its level meter, plus:

- **Mute other audio while recording** (off by default). When a recording starts, Typelite
  mutes the Mac's sound output if it is not already muted; when the recording ends (stopped,
  cancelled or failed) it unmutes it again. It never unmutes sound the user had muted
  themselves.
- macOS cannot mute single apps without an audio driver, so this mutes all output (music,
  video, calls).
- If Typelite quits or crashes while it has sound muted, it unmutes on the next launch.
