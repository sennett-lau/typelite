# Pill over full-screen apps, placed on the work area

The pill, the Ask answer panel and the typing nudge (which shows in the pill) appear over an app
in native macOS full screen, on the screen the pointer is on, exactly as they do on a normal
desktop. The pill's height above the bottom of the screen now comes from that screen's work
area (the part the Dock and menu bar do not cover) instead of one fixed offset sized for a Dock,
so it sits just above the Dock where there is one and near the bottom edge where there is not.

Status: building — 2026-09-26

Changes decisions in earlier plans:
- [pill-follows-cursor-and-escape](../2026-09-25-pill-follows-cursor-and-escape/index.md): the
  pill also follows the pointer onto a full-screen app's screen, and "bottom-centre" is measured
  on the work area with a 16 pt gap (was: 80 pt above the whole screen's bottom edge).
- [ask-panel-above-pill](../2026-09-26-ask-panel-above-pill/index.md): without a visible pill
  the panel uses the pill's new usual place, and it stays inside the work area.

## Goals

- User report: "when we use full-screen mode on the MacBook, the capsule doesn't follow the
  mouse to the screen that's using full-screen mode." The pill must show there.
- The pill sits at a sensible height on every screen: above a Dock, near the edge without one,
  near the bottom in full screen.
- Nothing changes about focus: the pill and the panel never take focus from the app.

## Non-goals

- Showing over the lock screen, the screen saver, or system alerts.
- Changing how the pill follows the pointer between screens (still a 250 ms check and a fade).

## Key decisions

| Decision | Reason |
|---|---|
| The pill and Ask windows get the collection behavior CanJoinAllSpaces + FullScreenAuxiliary + Stationary + IgnoresCycle | FullScreenAuxiliary is what lets a window onto another app's full-screen Space; Tauri's `visibleOnAllWorkspaces` sets only CanJoinAllSpaces. Stationary and IgnoresCycle keep it out of Mission Control and ⌘`. |
| Both windows become non-activating panels (`NSPanel` + NonactivatingPanel style) | Since macOS 10.14 a plain window of an app with a Dock icon ("Show in Dock" on, the default) is not allowed over a full-screen app; a non-activating panel is, whatever the activation policy. |
| Level `NSStatusWindowLevel` (25) | In full screen the Dock (20) and menu bar (24) slide in over the app, and the pill sits at the bottom; 25 is the lowest standard level above both. Pop-up menus (101) stay above the pill. |
| Applied at startup, when the Ask window is recreated, each time the Ask panel shows, and after "Show in Dock" changes | Cheap and idempotent; covers every path that could create or reset the window. |
| The panel swap only happens when the window's class and memory layout are exactly what Tauri creates; otherwise the window keeps its class and only gets the behavior and level | Never risk a crash on a Tauri update; the log says which path was taken. |
| The pill's bottom edge sits 16 pt above the bottom of the screen's work area, centred on the work area | 16 pt (half the pill's height) reads as resting on the Dock or the screen edge, clears rounded display corners and keeps the 6 pt hide slide on screen. Centring on the work area keeps the pill in the middle of the usable space when the Dock is on the left or right. |
| Work areas come from Tauri's monitor `workArea` (macOS `visibleFrame`), converted with each monitor's own scale | No new native code; the mixed-scale rule from `CLAUDE.md`. An auto-hidden Dock or a full-screen Space reports the whole screen, so the pill sits near the bottom there. |
| The pill's right-click menu grows upwards from the pill's bottom edge | The pill is now close to the screen edge; a menu centred on it would run off the screen. |

## Parts

| File | Covers |
|---|---|
| [full-screen.md](full-screen.md) | Why the pill was missing over full-screen apps, the window setup, activation policy, and the manual test. |
| [placement.md](placement.md) | Where the pill sits on each screen: work area, gap, Dock positions, full screen, mixed scale. |

## Open questions

- None. The Space behaviour itself cannot be unit tested; it needs the manual test in
  [full-screen.md](full-screen.md) on each macOS release.
