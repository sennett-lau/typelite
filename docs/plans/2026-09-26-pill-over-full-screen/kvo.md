# The panel swap and key-value observing

How Tauri's window becomes a non-activating panel although AppKit and WebKit are already
watching it. Back to [index](index.md).

## What went wrong

The first build of this plan skipped the swap in the real app. The log said:

```
Overlay window capsule: unexpected window class "NSKVONotifying_TaoWindow", kept as a window
Overlay window ask: unexpected window class "NSKVONotifying_TaoWindow", kept as a window
```

Key-value observing (KVO) is Cocoa's "tell me when this property changes" mechanism. The first
time anything observes an object, the Objective-C runtime creates a hidden subclass named
`NSKVONotifying_<class>`, overrides the observed setters there, and switches the object to it.
By the time Typelite sees them, the pill and Ask windows are observed (WebKit's
`WKWindowVisibilityObserver` watches `contentLayoutRect` and `titlebarAppearsTransparent`, and
AppKit watches a layer property), so their class is `NSKVONotifying_TaoWindow`, with Tauri's
`TaoWindow` as its superclass. The swap accepted only `TaoWindow`, so it never ran, and with
"Show in Dock" on (the default) the pill stayed off full-screen Spaces.

## Why a plain swap is not enough

KVO files each observer under the class the object *reports* (`TaoWindow`; the hidden class
answers `class` with its superclass). Just replacing the class with the panel class:

- drops the hidden class, so observed setters (here `setContentView:`) stop notifying;
- makes every later removal of an earlier observer fail: KVO looks it up under the panel class,
  does not find it and throws "Cannot remove an observer … because it is not registered".
  WebKit removes its observer when the window closes, and an Objective-C exception that reaches
  Rust aborts the app. A test binary reproduced both.

## The swap now (`src-tauri/src/overlay_window.rs`)

1. The class chain is classified (a pure, unit-tested function): `TaoWindow`, or
   `NSKVONotifying_TaoWindow` directly on `TaoWindow`, may be swapped; our panel class (with or
   without its own KVO class) is already done; anything else is left alone with the
   "unexpected window class" line.
2. The layout check compares the panel class with Tauri's class under the KVO class.
3. The keys the old KVO class handled are read from its own `setFoo:` methods.
4. After the swap, a do-nothing observer is added and removed for each of those keys. KVO then
   builds `NSKVONotifying_TypeliteOverlayPanel` with the same setters and moves the object onto
   it; the earlier observers are stored per object, so they stay registered.
5. The panel class overrides `addObserver:forKeyPath:options:context:` and both
   `removeObserver:` methods. It notes the observers added after the swap; a removal of one of
   them goes through normally, and a removal of an older one runs while the object briefly
   wears its old class again, which is where KVO filed it. The notes are dropped in `dealloc`.
6. If the new KVO class did not appear, the object gets its original class back and the log
   says "key-value observing could not be moved to the panel, kept as a window".

All of this happens on the main thread, where AppKit windows live.

## Log lines

| Line | Meaning |
|---|---|
| `Overlay window capsule: now a non-activating panel (was "NSKVONotifying_TaoWindow", now "NSKVONotifying_TypeliteOverlayPanel")` | The swap worked; the same line appears for `ask`. |
| `… unexpected window class "…", kept as a window` | A class this code does not know (for example after a Tauri update). Full screen then works only with "Show in Dock" off. |
| `… window layout differs, kept as a window` | Tauri's class changed size or moved its `focusable` variable. |
| `… key-value observing could not be moved to the panel, kept as a window` | Step 4 failed; the window is exactly as before. |

## How it was checked

A throwaway binary (not committed) opened the real `capsule` window, added its own KVO observer,
ran the conversion and read the result back: class chain
`NSKVONotifying_TypeliteOverlayPanel → TypeliteOverlayPanel → NSPanel`, all four earlier
observers still registered, `setTitle:` still notified the observer registered before the swap,
observers added and removed after it behaved normally, style mask gained NonactivatingPanel,
level 25, behavior 0x151, `canBecomeKeyWindow` false. Removing the pre-swap observer and closing
the window (WebKit removes its observer) raised no exception; the same close without the
removal routing aborted.

## Considered

- **Depending on `tauri-nspanel`** (MIT or Apache-2.0, maintained for Tauri 2): it swaps the
  class with `object_setClass` and does nothing about KVO, so it has the same close-time abort,
  and it brings a larger API than the one swap we need.
- **Switching the activation policy to `Accessory` while the pill shows:** changes the Dock icon
  and the app switcher entry under the user, so rejected.
- **Creating the windows as panels from the start:** Tauri 2 has no panel option; building the
  window without its webview (Tauri's unstable multi-webview API) would change how every
  window is created and looked up, for one class change.
- **Moving each observer by reading KVO's private records** (observer, options, context): those
  are private instance variables with bit fields and weak references; too fragile.
- **Catching the "not registered" exception and retrying:** needs exception bridging and relies
  on KVO leaving its locks in order after throwing; the notes in step 5 avoid exceptions.
