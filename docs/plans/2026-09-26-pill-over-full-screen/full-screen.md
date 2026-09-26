# Full-screen Spaces

Why the pill did not appear over full-screen apps, and how the pill and Ask windows are set up
so they do. Back to [index](index.md).

## The cause

A macOS app in full screen gets its own Space (a separate desktop). The pill already followed
the pointer between screens, and the pointer's screen was the right one, but macOS did not allow
the window onto that Space, so it stayed on the normal desktop behind it:

- Tauri's `visibleOnAllWorkspaces` sets only `CanJoinAllSpaces` in the window's collection
  behavior. A window also needs `FullScreenAuxiliary` to sit over another app's full-screen
  window.
- Since macOS 10.14 that is still not enough for a plain window (`NSWindow`) of a normal app,
  one with a Dock icon (the `Regular` activation policy, which "Show in Dock" selects and which
  is the default). Only menu-bar apps (`Accessory`) and non-activating panels may float there.
- Tauri's always-on-top level (5) is below the Dock and the menu bar, which slide in over a
  full-screen app.

## The setup (`src-tauri/src/overlay_window.rs`)

For the `capsule` and `ask` windows, on the main thread:

1. The window's class is swapped for a small subclass of `NSPanel` that keeps Tauri's
   `focusable` variable and its "can become key / main window" answers (false for both
   windows), then the `NonactivatingPanel` style is added and `hidesOnDeactivate` is turned off.
   The swap is skipped (with a log line) unless the window's class is Tauri's own and the two
   classes have the same size and the `focusable` variable at the same place.
2. The collection behavior becomes CanJoinAllSpaces + FullScreenAuxiliary + Stationary +
   IgnoresCycle; conflicting bits (Managed, Transient, MoveToActiveSpace, ParticipatesInCycle,
   FullScreenPrimary, FullScreenNone) are cleared, other bits kept.
3. The level becomes `NSStatusWindowLevel` (25).

It runs at startup, after the Ask window is recreated, each time the Ask panel shows, and after
"Show in Dock" switches the activation policy. It is idempotent.

Focus is unchanged: both windows were already non-focusable (never the key window), the pill
sets `focusable` false before every update, and the Ask panel keeps `acceptFirstMouse` so its
first click reaches its buttons (plans `copy-when-no-field` and `ask-panel-above-pill`). As a
non-activating panel, a click on either window no longer activates Typelite at all.

## Activation policy

| "Show in Dock" | Policy | Over full-screen apps |
|---|---|---|
| On (default) | `Regular` | Only as a non-activating panel, so the panel swap is what makes it work. |
| Off | `Accessory` | Works with the collection behavior alone; the panel swap does no harm. |

If the log shows "kept as a window" for either window, the swap was skipped and full-screen
support depends on "Show in Dock" being off.

## Screens and follow

A full-screen Space is on the same display, so Tauri reports the same monitor and scale factor
there; the pointer check (`pickFollowTarget`) finds it unchanged. Full screen hides the Dock and
the menu bar, so the work area is the whole screen and the pill sits near the bottom edge (see
[placement.md](placement.md)).

## Manual test

The Space behaviour needs a person; unit tests cover only the flag, level and placement maths.

1. Built-in screen only: open Safari or Notes, enter full screen (green button or ⌃⌘F), press
   the Dictate shortcut. The pill appears at the bottom centre over the full-screen app, 16 pt
   above the edge; the app keeps focus (typing still goes to it). Speak, stop: the text is
   pasted into the app.
2. Same with Ask anything: the answer panel appears above the pill over the full-screen app;
   Copy and Insert work with one click; Escape closes it.
3. With an external monitor: put one screen in full screen, leave the other a normal desktop.
   Start a dictation and move the pointer between screens: the pill fades across and sits at
   the bottom centre of each, over the full-screen app on one and above the Dock (or near the
   edge) on the other.
4. Repeat 1 with "Show in Dock" off, and once after switching it at runtime.
5. Mission Control and ⌘` do not show or select the pill.
