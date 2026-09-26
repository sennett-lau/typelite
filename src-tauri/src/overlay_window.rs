//! Plan `pill-over-full-screen`: lets the pill and the Ask panel show over an app in native
//! macOS full screen.
//!
//! A full-screen app gets its own Space (a separate desktop). macOS shows another app's window
//! there only when all of these hold:
//!
//! - The window's *collection behavior* (how it takes part in Spaces and Mission Control)
//!   includes `FullScreenAuxiliary` ("may sit over a full-screen window") together with
//!   `CanJoinAllSpaces` ("is on every Space"). Tauri's `visibleOnAllWorkspaces` sets only the
//!   second. We also add `Stationary` (Mission Control leaves it alone) and `IgnoresCycle`
//!   (⌘` never cycles to it).
//! - Since macOS 10.14 a plain window (`NSWindow`) of a normal app (one with a Dock icon, the
//!   `Regular` activation policy, which "Show in Dock" selects) is not allowed there; only
//!   windows of a menu-bar app (`Accessory`) are, and *non-activating panels* of any app. So the
//!   window is turned into a non-activating panel (`NSPanel` with the `NonactivatingPanel` style),
//!   which also means clicking it never activates Typelite.
//! - Its level (the window's layer) puts it above what full screen shows on top of the app:
//!   the Dock (level 20) and the menu bar (24) slide in over a full-screen app when the pointer
//!   reaches the edge, and the pill sits at the bottom. `NSStatusWindowLevel` (25) is the lowest
//!   standard level above both. Pop-up menus (101), the screen saver and alerts stay above it.
//!
//! The window stays non-focusable (it can never become the key window), so the frontmost app
//! keeps focus.

/// `NSWindowCollectionBehavior` bits (AppKit, `NSWindow.h`).
pub mod behavior {
    pub const CAN_JOIN_ALL_SPACES: usize = 1 << 0;
    pub const MOVE_TO_ACTIVE_SPACE: usize = 1 << 1;
    pub const MANAGED: usize = 1 << 2;
    pub const TRANSIENT: usize = 1 << 3;
    pub const STATIONARY: usize = 1 << 4;
    pub const PARTICIPATES_IN_CYCLE: usize = 1 << 5;
    pub const IGNORES_CYCLE: usize = 1 << 6;
    pub const FULL_SCREEN_PRIMARY: usize = 1 << 7;
    pub const FULL_SCREEN_AUXILIARY: usize = 1 << 8;
    pub const FULL_SCREEN_NONE: usize = 1 << 9;
}

/// `NSStatusWindowLevel`: above the Dock (20) and the menu bar (24), below pop-up menus (101).
pub const OVERLAY_WINDOW_LEVEL: isize = 25;

/// `NSWindowStyleMaskNonactivatingPanel`: a panel that never activates its app when clicked.
pub const NONACTIVATING_PANEL_STYLE: usize = 1 << 7;

/// The collection behavior for the pill and the Ask panel: on every Space, allowed over
/// full-screen apps, left alone by Mission Control and ⌘`. Bits that contradict these (each
/// group allows only one) are cleared; everything else is kept.
pub fn overlay_collection_behavior(current: usize) -> usize {
    use behavior::*;
    let cleared = current
        & !(MOVE_TO_ACTIVE_SPACE
            | MANAGED
            | TRANSIENT
            | PARTICIPATES_IN_CYCLE
            | FULL_SCREEN_PRIMARY
            | FULL_SCREEN_NONE);
    cleared | CAN_JOIN_ALL_SPACES | STATIONARY | IGNORES_CYCLE | FULL_SCREEN_AUXILIARY
}

/// The style mask with the non-activating panel bit added.
pub fn overlay_style_mask(current: usize) -> usize {
    current | NONACTIVATING_PANEL_STYLE
}

/// What the window's current class must look like before it may be swapped for the panel
/// class: same instance size, and the one extra variable (`focusable`, which Tauri's window
/// class reads) at the same place. Otherwise the swap is skipped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClassLayout {
    pub instance_size: usize,
    pub focusable_offset: Option<isize>,
}

pub fn panel_swap_is_safe(window: ClassLayout, panel: ClassLayout) -> bool {
    window.instance_size == panel.instance_size
        && window.focusable_offset.is_some()
        && window.focusable_offset == panel.focusable_offset
}

/// Makes `window` able to show over full-screen apps (see the module docs). Safe to call again:
/// it is idempotent. Runs on the main thread (AppKit requires it). Does nothing off macOS.
pub fn make_overlay(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        let target = window.clone();
        let label = window.label().to_string();
        let result = window.run_on_main_thread(move || {
            if let Ok(ns_window) = target.ns_window() {
                // SAFETY: Tauri hands out the live NSWindow of this window; we are on the main
                // thread.
                unsafe { mac::apply(ns_window.cast(), &label) };
            }
        });
        if let Err(error) = result {
            tracing::warn!("Overlay window setup was not scheduled: {error}");
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = window;
}

#[cfg(target_os = "macos")]
mod mac {
    use super::{
        overlay_collection_behavior, overlay_style_mask, panel_swap_is_safe, ClassLayout,
        OVERLAY_WINDOW_LEVEL,
    };
    use objc2::runtime::{AnyClass, AnyObject, Bool, ClassBuilder, Sel};
    use objc2::{msg_send, sel};
    use std::sync::OnceLock;

    /// Tauri's own window class (from its windowing library, tao).
    const TAURI_WINDOW_CLASS: &std::ffi::CStr = c"TaoWindow";
    const FOCUSABLE_IVAR: &std::ffi::CStr = c"focusable";

    /// `canBecomeKeyWindow` / `canBecomeMainWindow`: the same answer as Tauri's class gives,
    /// from the same `focusable` variable (false for the pill and the Ask panel).
    extern "C" fn is_focusable(this: &AnyObject, _: Sel) -> Bool {
        let class = this.class();
        match class.instance_variable(FOCUSABLE_IVAR) {
            // SAFETY: the variable is a `Bool`, declared below and by Tauri's class.
            Some(ivar) => unsafe { *ivar.load::<Bool>(this) },
            None => Bool::NO,
        }
    }

    /// A subclass of `NSPanel` that looks like Tauri's window class to Tauri: the same
    /// `focusable` variable and the same focus answers.
    fn panel_class() -> Option<&'static AnyClass> {
        static CLASS: OnceLock<Option<usize>> = OnceLock::new();
        let address = CLASS.get_or_init(|| {
            let superclass = AnyClass::get(c"NSPanel")?;
            let mut builder = ClassBuilder::new(c"TypeliteOverlayPanel", superclass)?;
            builder.add_ivar::<Bool>(FOCUSABLE_IVAR);
            // SAFETY: both selectors take no arguments and return BOOL.
            unsafe {
                builder.add_method(
                    sel!(canBecomeKeyWindow),
                    is_focusable as extern "C" fn(_, _) -> _,
                );
                builder.add_method(
                    sel!(canBecomeMainWindow),
                    is_focusable as extern "C" fn(_, _) -> _,
                );
            }
            Some(builder.register() as *const AnyClass as usize)
        });
        // SAFETY: registered classes live for the whole process.
        address.map(|address| unsafe { &*(address as *const AnyClass) })
    }

    fn layout(class: &AnyClass) -> ClassLayout {
        ClassLayout {
            instance_size: class.instance_size(),
            focusable_offset: class
                .instance_variable(FOCUSABLE_IVAR)
                .map(|ivar| ivar.offset()),
        }
    }

    /// Turns Tauri's window into the non-activating panel class when that is safe.
    unsafe fn become_panel(window: &AnyObject, label: &str) {
        let current = window.class();
        let Some(panel) = panel_class() else {
            tracing::warn!("Overlay window {label}: the panel class could not be created");
            return;
        };
        if std::ptr::eq(current, panel) {
            return;
        }
        if current.name() != TAURI_WINDOW_CLASS {
            tracing::warn!(
                "Overlay window {label}: unexpected window class {:?}, kept as a window",
                current.name()
            );
            return;
        }
        if !panel_swap_is_safe(layout(current), layout(panel)) {
            tracing::warn!("Overlay window {label}: window layout differs, kept as a window");
            return;
        }
        // SAFETY: the panel class is a subclass of NSPanel (itself an NSWindow subclass) with
        // the same size and the same `focusable` variable at the same place, checked above.
        unsafe { AnyObject::set_class(window, panel) };
        // Panels hide when their app is inactive by default; the pill must not.
        let _: () = unsafe { msg_send![window, setHidesOnDeactivate: false] };
        tracing::info!("Overlay window {label}: now a non-activating panel");
    }

    pub unsafe fn apply(ns_window: *mut AnyObject, label: &str) {
        // SAFETY: the caller passes a live NSWindow.
        let Some(window) = (unsafe { ns_window.as_ref() }) else {
            return;
        };
        unsafe { become_panel(window, label) };
        let is_panel = window.class().name() != TAURI_WINDOW_CLASS;
        unsafe {
            if is_panel {
                // Only a panel knows the non-activating style.
                let mask: usize = msg_send![window, styleMask];
                let _: () = msg_send![window, setStyleMask: overlay_style_mask(mask)];
            }
            let behavior: usize = msg_send![window, collectionBehavior];
            let _: () =
                msg_send![window, setCollectionBehavior: overlay_collection_behavior(behavior)];
            let _: () = msg_send![window, setLevel: OVERLAY_WINDOW_LEVEL];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::behavior::*;
    use super::*;

    #[test]
    fn a_plain_window_gets_every_overlay_bit() {
        let behavior = overlay_collection_behavior(0);
        assert_eq!(
            behavior,
            CAN_JOIN_ALL_SPACES | STATIONARY | IGNORES_CYCLE | FULL_SCREEN_AUXILIARY
        );
    }

    #[test]
    fn tauris_all_workspaces_bit_is_kept_and_conflicting_bits_are_cleared() {
        // What Tauri leaves on the window (`visibleOnAllWorkspaces`), plus bits from each
        // exclusive group that would contradict the overlay behavior.
        let current = CAN_JOIN_ALL_SPACES
            | MOVE_TO_ACTIVE_SPACE
            | MANAGED
            | TRANSIENT
            | PARTICIPATES_IN_CYCLE
            | FULL_SCREEN_PRIMARY
            | FULL_SCREEN_NONE;
        let behavior = overlay_collection_behavior(current);
        assert_eq!(
            behavior,
            CAN_JOIN_ALL_SPACES | STATIONARY | IGNORES_CYCLE | FULL_SCREEN_AUXILIARY
        );
        for cleared in [
            MOVE_TO_ACTIVE_SPACE,
            MANAGED,
            TRANSIENT,
            PARTICIPATES_IN_CYCLE,
            FULL_SCREEN_PRIMARY,
            FULL_SCREEN_NONE,
        ] {
            assert_eq!(behavior & cleared, 0, "bit {cleared:#x} must be cleared");
        }
    }

    #[test]
    fn unrelated_bits_survive_and_applying_twice_changes_nothing() {
        const FULL_SCREEN_ALLOWS_TILING: usize = 1 << 11;
        let once = overlay_collection_behavior(FULL_SCREEN_ALLOWS_TILING);
        assert_ne!(once & FULL_SCREEN_ALLOWS_TILING, 0);
        assert_eq!(overlay_collection_behavior(once), once);
        assert_eq!(
            overlay_style_mask(overlay_style_mask(0)),
            overlay_style_mask(0)
        );
    }

    #[test]
    fn the_bits_and_level_match_appkit() {
        // Values from AppKit's NSWindow.h and CGWindowLevel.h.
        assert_eq!(CAN_JOIN_ALL_SPACES, 1);
        assert_eq!(STATIONARY, 16);
        assert_eq!(IGNORES_CYCLE, 64);
        assert_eq!(FULL_SCREEN_AUXILIARY, 256);
        assert_eq!(NONACTIVATING_PANEL_STYLE, 128);
        // NSStatusWindowLevel: above the Dock (20) and the menu bar (24), below pop-up menus.
        const DOCK_LEVEL: isize = 20;
        const MAIN_MENU_LEVEL: isize = 24;
        const POP_UP_MENU_LEVEL: isize = 101;
        const {
            assert!(OVERLAY_WINDOW_LEVEL > DOCK_LEVEL);
            assert!(OVERLAY_WINDOW_LEVEL > MAIN_MENU_LEVEL);
            assert!(OVERLAY_WINDOW_LEVEL < POP_UP_MENU_LEVEL);
        }
    }

    #[test]
    fn the_panel_swap_needs_the_same_layout() {
        let window = ClassLayout {
            instance_size: 24,
            focusable_offset: Some(16),
        };
        assert!(panel_swap_is_safe(window, window));
        let bigger = ClassLayout {
            instance_size: 32,
            ..window
        };
        assert!(!panel_swap_is_safe(window, bigger));
        let moved = ClassLayout {
            focusable_offset: Some(17),
            ..window
        };
        assert!(!panel_swap_is_safe(window, moved));
        let missing = ClassLayout {
            focusable_offset: None,
            ..window
        };
        assert!(!panel_swap_is_safe(missing, missing));
    }
}
