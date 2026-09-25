# UI revamp

Typelite gets its own look: a glass main window without a
title bar, a new sidebar, tabs across the top of Settings, macOS-style grouped rows, shortcut
tiles on Home, a new icon, and an "Aurora" dark mode. All features and settings stay.

Status: agreed — 2026-09-24

Builds on [main-window-cleanup](../2026-09-24-main-window-cleanup/index.md) (tabs and content) and includes
[glass-main-window](../2026-09-24-glass-main-window/index.md) (glass window). The visual reference is
[mock.html](mock.html): open it in a browser; the "Main window" section is interactive.

## Goals

- A distinct identity of its own.
- Native macOS feel: glass, SF Pro, System Settings-style grouped rows, macOS switches.
- A dark mode with colour, not only grey and black.

## Non-goals

- New features or settings. Only layout, styling, icons and the window.

## Key decisions

| Decision | Reason |
|---|---|
| Glass main window without title bar (plan `glass-main-window`) | Native look; matches the pill. |
| Settings uses tabs across the top (General, Speech, AI, Prompt Presets, System) instead of a second sidebar | Saves width and matches macOS System Settings. |
| Every settings page is grouped rows: small uppercase group label, rounded group, hairline between rows, label left and control right | Matches macOS System Settings; clear separation between groups. |
| Sidebar: logo mark and name, three tabs, live connection status (speech, AI), About at the bottom | Status at a glance, and a distinct identity. |
| Home: title, three shortcut tiles, then "Your setup" and "What's new" side by side | Shortcuts first, as the user asked. |
| Dark mode "Aurora": near-black glass lit by teal and violet corner glows, teal accent `#3FD8C2` | Chosen by the user over Midnight Blue, Plum and plain graphite. |
| Per-feature colours on the Home tile icons only: Dictate, Translate, Ask | Adds life without noise. No coloured borders or shadows on the tiles. |
| New pastel icon (redrawn from the user's design) | Chosen by the user. |

## Parts

| File | Covers |
|---|---|
| [design.md](design.md) | Tokens, type, layout and component rules per screen. |
| [mock.html](mock.html) | Interactive visual reference. |

## Open questions

- None.
