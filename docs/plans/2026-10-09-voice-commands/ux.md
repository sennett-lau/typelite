# UX

What the user sees. Part of [voice-commands](index.md).

## Pill

While the command runs, the Ask thinking pill shows a bolt and "Opening Safari" (or "Switching
to", "Hiding", "Quitting", "Running") for about 0.9 s, in the wider searching size so long names
fit. The app emits `ask:command` with the action and the resolved name. When the command worked,
no panel opens.

## Ask panel

The panel shows "Ask" as its title, never the spoken words, then one short line:

- No app called "X". / No Shortcut called "X". / Only the four folders.
- Several apps match "Microsoft": Microsoft Word, Microsoft Excel. Say the full name.
- Slack is not running. (hide or quit)
- "X" is not a web address Typelite can open.
- Quit Zoom? Unsaved work may ask to be saved. With **Cancel** and **Quit Zoom**.

The panel stays a non-activating panel: buttons go through the app, and Escape (handled
natively) closes it and cancels the quit.

## Settings

Settings → General → Shortcuts, under Ask anything: a "Voice commands" switch, off by default,
with a one-line explanation. It is stored as `voice_commands_enabled`. The strings are in every
interface language (en, zh, zh-Hant, es, fr, de, ja) under `voiceCommands`.
