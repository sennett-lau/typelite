# 0005 — Glass main window

The main window loses its title bar and gets a translucent, blurred background, so it looks like
a native macOS utility (Control Centre, Notes sidebar) and matches the Native Glass pill.

Status: agreed — 2026-09-24

## Goals

- No separate title bar strip. The red/yellow/green window buttons float over the top-left of
  the sidebar, as in Finder and Notes.
- The desktop shows through the window, blurred, in both light and dark mode.
- Text stays easy to read on any wallpaper.

## Non-goals

- Blur for the capsule and Ask windows (handled in the theme pass, plan 0002 / P8b).
- Custom window buttons. macOS's own buttons stay.

## Key decisions

| Decision | Reason |
|---|---|
| Keep the native window buttons, hide only the bar: Tauri `titleBarStyle: "Overlay"`, `hiddenTitle: true` | Removing decorations entirely would also remove close/minimise/zoom and native resizing. |
| Real blur comes from macOS, not CSS: main window `transparent: true` plus a window effect (`NSVisualEffectView`, material `sidebar` or `underWindowBackground`, state follows window active state) | CSS `backdrop-filter` cannot blur the desktop behind the window. The main window is a plain rectangle, so the effect fits it exactly. |
| Sidebar fully glass; content area glass with a light tint | Matches macOS apps and keeps settings text readable over busy wallpapers. |
| A drag strip across the top of the window | Without a title bar the user still needs somewhere to drag the window. |

## Parts

| File | Covers |
|---|---|
| [window.md](window.md) | Window config, layout and tokens. |

## Open questions

- None.
