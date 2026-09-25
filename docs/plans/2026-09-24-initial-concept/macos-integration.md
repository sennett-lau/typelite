# macOS integration

The system-level pieces and their permissions. Back to [index](index.md).

## Global shortcuts: event tap

- A `CGEventTap` at session level watches key down/up and modifier-flag changes.
- End is keycode 119; Right Shift is 60 and Right Control is 62. Right-hand modifiers are told
  apart from left-hand ones by the device-dependent flag bits.
- Bound keys are swallowed (the tap returns nothing), so End never reaches the focused app.
  Auto-repeat events for a held key are ignored.
- Swallowing keys needs an active tap, which needs **Accessibility** permission.
- If the tap is created before permission is granted it fails, so the app retries until it
  succeeds instead of needing a restart.

## The capsule: non-activating panel

- An `NSPanel` with `.nonactivatingPanel`, floating level, joining all Spaces, and shown without
  becoming key. That keeps keyboard focus in the user's app.
- Placement: find the `NSScreen` whose frame contains `NSEvent.mouseLocation` and put the
  capsule bottom-centre on it. AppKit uses points for every screen, so mixed Retina and 1x
  monitors need no scale maths.
- The position is computed from the screen each time the capsule appears, and never read back,
  changed and written again (that causes the window to drift).

## Pasting

1. Save every item currently on `NSPasteboard.general`.
2. Write the new text.
3. Post ⌘V with `CGEvent` (needs **Accessibility**).
4. After a short delay, restore the saved items.

Fallback when paste is not possible: leave the text on the clipboard and tell the user.

## Selected text and app context

- Selected text (for voice-edit and Translate-selection later) comes from the Accessibility API
  (`AXUIElement`, focused element, selected text attribute).
- The frontmost app (`NSWorkspace.shared.frontmostApplication`) can pick a per-app tone later.

## Permissions

| Permission | Why | Asked when |
|---|---|---|
| Accessibility | Event tap that swallows keys, posting ⌘V, reading selected text | First launch onboarding |
| Microphone | Recording | First recording |

A first-launch window explains each permission, opens the right System Settings pane, and shows
live whether it has been granted.

## Signing and permission stability

macOS ties an Accessibility grant to the app's code signature. An ad-hoc-signed build gets a new
signature every time, so the old grant is silently ignored. Every build is therefore signed with
the same self-signed certificate, which keeps the signature requirement stable across rebuilds.
