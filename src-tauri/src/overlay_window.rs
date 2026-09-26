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
//!
//! ## Key-value observing (KVO)
//!
//! By the time we see it, a Tauri window is already *observed*: WebKit and AppKit watch some of
//! its properties (for example `contentLayoutRect`). KVO does that by switching the object to a
//! hidden subclass, `NSKVONotifying_TaoWindow`, and it files every observer under the class the
//! object *reports* (`TaoWindow`). Swapping the class naively has two effects:
//!
//! - setters such as `setContentView:` no longer notify anyone (the hidden subclass is gone);
//! - worse, when an observer later removes itself (WebKit does, when the window closes), KVO
//!   looks it up under the new class, does not find it, and throws an Objective-C exception,
//!   which aborts a Rust program.
//!
//! So after the swap we (1) add and remove a do-nothing observer for each key the old hidden
//! subclass handled, which makes KVO build `NSKVONotifying_TypeliteOverlayPanel` with the same
//! setters, and (2) the panel class overrides the three add/remove-observer methods: an
//! observer registered after the swap is removed normally, one registered before it is removed
//! while the object briefly wears its old class again, exactly as KVO filed it. If any step
//! does not work out, the window keeps its original class and a log line says so.

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

/// Tauri's own window class (from its windowing library, tao).
pub const TAURI_WINDOW_CLASS: &str = "TaoWindow";
/// Our `NSPanel` subclass that stands in for Tauri's window class.
pub const OVERLAY_PANEL_CLASS: &str = "TypeliteOverlayPanel";
/// Prefix of the classes that key-value observing (KVO) creates at run time.
///
/// KVO is Cocoa's "tell me when this property changes" mechanism. The first time anything
/// observes an object, the runtime makes a hidden subclass named `NSKVONotifying_<class>`
/// that overrides the observed setters, and switches the object to it. AppKit and WebKit
/// observe Tauri's windows (for example `contentLayoutRect`), so the class of a live Tauri
/// window is `NSKVONotifying_TaoWindow`, whose superclass is `TaoWindow`.
pub const KVO_CLASS_PREFIX: &str = "NSKVONotifying_";

/// What a window's class chain says about it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowKind {
    /// Tauri's window class; `observed` when a KVO class sits on top of it.
    TauriWindow { observed: bool },
    /// Already our panel class; `observed` when a KVO class sits on top of it.
    OverlayPanel { observed: bool },
    /// Anything else: left alone.
    Unknown,
}

/// Classifies a window from its class chain: the object's class first, then each superclass
/// in turn. A leading KVO class counts only when it is exactly `NSKVONotifying_` plus the name
/// of the class right under it (that is how the runtime names and places it).
pub fn classify_window_class(chain: &[&str]) -> WindowKind {
    let (observed, base) = match chain {
        [first, second, ..] if first.strip_prefix(KVO_CLASS_PREFIX) == Some(*second) => {
            (true, *second)
        }
        [first, ..] if first.starts_with(KVO_CLASS_PREFIX) => return WindowKind::Unknown,
        [first, ..] => (false, *first),
        [] => return WindowKind::Unknown,
    };
    match base {
        TAURI_WINDOW_CLASS => WindowKind::TauriWindow { observed },
        OVERLAY_PANEL_CLASS => WindowKind::OverlayPanel { observed },
        _ => WindowKind::Unknown,
    }
}

/// The keys a KVO class notifies for, from the names of the methods it defines itself: each
/// `setFoo:` setter stands for the key `foo` (`setURL:` for `URL`). Its other methods
/// (`class`, `dealloc`, `_isKVOA`) are KVO's own bookkeeping and are skipped.
pub fn kvo_keys_from_methods<'a>(methods: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    let mut keys: Vec<String> = methods
        .into_iter()
        .filter_map(|name| name.strip_prefix("set")?.strip_suffix(':'))
        .filter(|key| !key.is_empty() && !key.contains(':'))
        .filter_map(|key| {
            let mut chars = key.chars();
            let first = chars.next()?;
            if !first.is_ascii_uppercase() {
                return None;
            }
            // `setURL:` belongs to `URL`; `setContentView:` to `contentView`.
            let second_is_upper = chars.next().is_some_and(|c| c.is_ascii_uppercase());
            Some(if second_is_upper {
                key.to_string()
            } else {
                first.to_ascii_lowercase().to_string() + &key[1..]
            })
        })
        .collect();
    keys.sort();
    keys.dedup();
    keys
}

/// One observer registered on a panel after the class swap: observer address, key path and
/// context pointer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Observation {
    pub observer: usize,
    pub key_path: String,
    pub context: usize,
}

/// Decides how to remove an observer from a swapped panel. Returns true, and forgets the
/// record, when it was registered after the swap (remove it normally); false when it predates
/// the swap (remove it under the old class). Like KVO, a removal without a context takes the
/// most recent matching registration.
pub fn take_observation(
    records: &mut Vec<Observation>,
    observer: usize,
    key_path: &str,
    context: Option<usize>,
) -> bool {
    let found = records.iter().rposition(|record| {
        record.observer == observer
            && record.key_path == key_path
            && context.is_none_or(|context| record.context == context)
    });
    match found {
        Some(index) => {
            records.remove(index);
            true
        }
        None => false,
    }
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
        classify_window_class, kvo_keys_from_methods, overlay_collection_behavior,
        overlay_style_mask, panel_swap_is_safe, take_observation, ClassLayout, Observation,
        WindowKind, OVERLAY_WINDOW_LEVEL,
    };
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject, Bool, ClassBuilder, Sel};
    use objc2::{class, msg_send, sel};
    use std::cell::Cell;
    use std::collections::HashMap;
    use std::ffi::{c_void, CString};
    use std::sync::{Mutex, OnceLock};

    const FOCUSABLE_IVAR: &std::ffi::CStr = c"focusable";
    /// Observed when the old KVO class listed no setters, so the panel still gets a KVO class
    /// (its `dealloc` cleans up the observers' records).
    const FALLBACK_KVO_KEY: &str = "contentView";

    /// What a swapped panel remembers about KVO: the class it had before (the hidden KVO
    /// subclass of Tauri's class) and the observers registered since. Keyed by the window's
    /// address; the entry is dropped in `dealloc`, before the address can be reused.
    struct SwappedPanel {
        old_class: usize,
        added: Vec<Observation>,
    }

    fn swapped_panels() -> std::sync::MutexGuard<'static, HashMap<usize, SwappedPanel>> {
        static PANELS: OnceLock<Mutex<HashMap<usize, SwappedPanel>>> = OnceLock::new();
        PANELS
            .get_or_init(Default::default)
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    thread_local! {
        /// Set while one of our observer overrides runs, so a nested call (Foundation's own
        /// methods may call each other) goes straight to the original implementation.
        static IN_OVERRIDE: Cell<bool> = const { Cell::new(false) };
    }

    /// Runs `body` with the nesting guard set; returns false (without running it) when the
    /// guard was already set.
    fn guarded(body: impl FnOnce()) -> bool {
        if IN_OVERRIDE.with(|flag| flag.replace(true)) {
            return false;
        }
        body();
        IN_OVERRIDE.with(|flag| flag.set(false));
        true
    }

    fn address(object: &AnyObject) -> usize {
        object as *const AnyObject as usize
    }

    /// `NSPanel`, the superclass whose methods our overrides forward to.
    fn ns_panel() -> &'static AnyClass {
        class!(NSPanel)
    }

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

    /// `addObserver:forKeyPath:options:context:`: registers as usual, then notes the observer
    /// as "registered after the swap" when this panel was swapped from a KVO class.
    extern "C" fn add_observer(
        this: &AnyObject,
        _: Sel,
        observer: *mut AnyObject,
        key_path: *mut AnyObject,
        options: usize,
        context: *mut c_void,
    ) {
        // SAFETY: forwards the caller's arguments unchanged to NSPanel's implementation.
        let forward = || unsafe {
            let _: () = msg_send![super(this, ns_panel()), addObserver: observer, forKeyPath: key_path, options: options, context: context];
        };
        let ran = guarded(|| {
            forward();
            if let Some(panel) = swapped_panels().get_mut(&address(this)) {
                panel.added.push(Observation {
                    observer: observer as usize,
                    // SAFETY: KVO key paths are NSStrings.
                    key_path: unsafe { ns_string_to_rust(key_path) },
                    context: context as usize,
                });
            }
        });
        if !ran {
            forward();
        }
    }

    /// Shared body of the two remove-observer overrides. `remove` sends the removal to the
    /// object as it currently is, `remove_as_panel` to NSPanel's implementation directly.
    fn remove_observer(
        this: &AnyObject,
        observer: *mut AnyObject,
        key_path: *mut AnyObject,
        context: Option<usize>,
        remove_as_panel: &dyn Fn(),
        remove: &dyn Fn(),
    ) {
        let ran = guarded(|| {
            // SAFETY: KVO key paths are NSStrings.
            let key = unsafe { ns_string_to_rust(key_path) };
            let old_class = {
                let mut panels = swapped_panels();
                panels.get_mut(&address(this)).and_then(|panel| {
                    let added_after_swap =
                        take_observation(&mut panel.added, observer as usize, &key, context);
                    (!added_after_swap).then_some(panel.old_class)
                })
            };
            match old_class {
                None => remove_as_panel(),
                Some(old_class) => {
                    // Registered before the swap: KVO filed it under the old class, so remove
                    // it while the object wears that class again, then put the panel class
                    // back. All of this happens on this one thread, in one call.
                    let current = this.class();
                    // SAFETY: the old class described this very object before the swap and
                    // has the same memory layout (checked when swapping).
                    unsafe {
                        AnyObject::set_class(this, &*(old_class as *const AnyClass));
                    }
                    remove();
                    // SAFETY: `current` is this object's class from a moment ago.
                    unsafe { AnyObject::set_class(this, current) };
                }
            }
        });
        if !ran {
            remove_as_panel();
        }
    }

    /// `removeObserver:forKeyPath:`.
    extern "C" fn remove_observer_for_key_path(
        this: &AnyObject,
        _: Sel,
        observer: *mut AnyObject,
        key_path: *mut AnyObject,
    ) {
        // SAFETY (both closures): forward the caller's arguments unchanged.
        remove_observer(
            this,
            observer,
            key_path,
            None,
            &|| unsafe {
                let _: () = msg_send![super(this, ns_panel()), removeObserver: observer, forKeyPath: key_path];
            },
            &|| unsafe {
                let _: () = msg_send![this, removeObserver: observer, forKeyPath: key_path];
            },
        );
    }

    /// `removeObserver:forKeyPath:context:`.
    extern "C" fn remove_observer_with_context(
        this: &AnyObject,
        _: Sel,
        observer: *mut AnyObject,
        key_path: *mut AnyObject,
        context: *mut c_void,
    ) {
        // SAFETY (both closures): forward the caller's arguments unchanged.
        remove_observer(
            this,
            observer,
            key_path,
            Some(context as usize),
            &|| unsafe {
                let _: () = msg_send![super(this, ns_panel()), removeObserver: observer, forKeyPath: key_path, context: context];
            },
            &|| unsafe {
                let _: () = msg_send![this, removeObserver: observer, forKeyPath: key_path, context: context];
            },
        );
    }

    /// `dealloc`: forgets the panel's KVO notes before its memory (and address) is freed.
    extern "C" fn dealloc(this: &AnyObject, _: Sel) {
        swapped_panels().remove(&address(this));
        // SAFETY: every dealloc must end by calling the superclass's.
        unsafe {
            let _: () = msg_send![super(this, ns_panel()), dealloc];
        }
    }

    unsafe fn ns_string_to_rust(string: *mut AnyObject) -> String {
        if string.is_null() {
            return String::new();
        }
        let utf8: *const std::ffi::c_char = unsafe { msg_send![string, UTF8String] };
        if utf8.is_null() {
            return String::new();
        }
        unsafe { std::ffi::CStr::from_ptr(utf8) }
            .to_string_lossy()
            .into_owned()
    }

    /// Registers a class once and returns it; registered classes live for the whole process.
    fn registered(
        cell: &'static OnceLock<Option<usize>>,
        build: impl FnOnce() -> Option<&'static AnyClass>,
    ) -> Option<&'static AnyClass> {
        let address = cell.get_or_init(|| build().map(|class| class as *const AnyClass as usize));
        // SAFETY: the address came from a registered class, which is never freed.
        address.map(|address| unsafe { &*(address as *const AnyClass) })
    }

    /// A subclass of `NSPanel` that looks like Tauri's window class to Tauri (the same
    /// `focusable` variable and focus answers) and handles KVO across the class swap.
    fn panel_class() -> Option<&'static AnyClass> {
        static CLASS: OnceLock<Option<usize>> = OnceLock::new();
        registered(&CLASS, || {
            let name = CString::new(super::OVERLAY_PANEL_CLASS).ok()?;
            let mut builder = ClassBuilder::new(&name, ns_panel())?;
            builder.add_ivar::<Bool>(FOCUSABLE_IVAR);
            // SAFETY: each function's signature matches the selector's (as declared by
            // NSWindow and NSObject(NSKeyValueObserverRegistration)).
            unsafe {
                builder.add_method(
                    sel!(canBecomeKeyWindow),
                    is_focusable as extern "C" fn(_, _) -> _,
                );
                builder.add_method(
                    sel!(canBecomeMainWindow),
                    is_focusable as extern "C" fn(_, _) -> _,
                );
                builder.add_method(
                    sel!(addObserver:forKeyPath:options:context:),
                    add_observer as extern "C" fn(_, _, _, _, _, _),
                );
                builder.add_method(
                    sel!(removeObserver:forKeyPath:),
                    remove_observer_for_key_path as extern "C" fn(_, _, _, _),
                );
                builder.add_method(
                    sel!(removeObserver:forKeyPath:context:),
                    remove_observer_with_context as extern "C" fn(_, _, _, _, _),
                );
                builder.add_method(sel!(dealloc), dealloc as extern "C" fn(_, _));
            }
            Some(builder.register())
        })
    }

    extern "C" fn ignore_change(
        _: &AnyObject,
        _: Sel,
        _: *mut AnyObject,
        _: *mut AnyObject,
        _: *mut AnyObject,
        _: *mut c_void,
    ) {
    }

    /// A do-nothing observer, registered for a moment so KVO rebuilds its class on the panel.
    fn observer_class() -> Option<&'static AnyClass> {
        static CLASS: OnceLock<Option<usize>> = OnceLock::new();
        registered(&CLASS, || {
            let mut builder = ClassBuilder::new(c"TypeliteKvoReobserver", class!(NSObject))?;
            // SAFETY: the signature matches -observeValueForKeyPath:ofObject:change:context:.
            unsafe {
                builder.add_method(
                    sel!(observeValueForKeyPath:ofObject:change:context:),
                    ignore_change as extern "C" fn(_, _, _, _, _, _),
                );
            }
            Some(builder.register())
        })
    }

    fn layout(class: &AnyClass) -> ClassLayout {
        ClassLayout {
            instance_size: class.instance_size(),
            focusable_offset: class
                .instance_variable(FOCUSABLE_IVAR)
                .map(|ivar| ivar.offset()),
        }
    }

    fn kind_of(object: &AnyObject) -> WindowKind {
        let mut chain = Vec::new();
        let mut class = Some(object.class());
        while let Some(current) = class {
            chain.push(current.name().to_string_lossy().into_owned());
            class = current.superclass();
        }
        let names: Vec<&str> = chain.iter().map(String::as_str).collect();
        classify_window_class(&names)
    }

    /// The keys the object's KVO class notifies for (its own `setFoo:` methods).
    fn observed_keys(kvo_class: &AnyClass) -> Vec<String> {
        let methods = kvo_class.instance_methods();
        let names: Vec<String> = methods
            .iter()
            .map(|method| method.name().name().to_string_lossy().into_owned())
            .collect();
        kvo_keys_from_methods(names.iter().map(String::as_str))
    }

    /// Adds and removes a do-nothing observer for each key. The object is no longer of a KVO
    /// class after the swap, so KVO makes a new one (`NSKVONotifying_TypeliteOverlayPanel`)
    /// with those setters and switches the object to it; the class stays because the earlier
    /// observers are still registered.
    unsafe fn reobserve(window: &AnyObject, keys: &[String]) -> bool {
        let Some(class) = observer_class() else {
            return false;
        };
        let observer: Option<Retained<AnyObject>> = unsafe { msg_send![class, new] };
        let Some(observer) = observer else {
            return false;
        };
        for key in keys {
            let Ok(key) = CString::new(key.as_str()) else {
                continue;
            };
            // SAFETY: plain Foundation calls on live objects; options 0 means nothing is read
            // or delivered, and the observer is removed right away.
            unsafe {
                let key_path: *mut AnyObject =
                    msg_send![class!(NSString), stringWithUTF8String: key.as_ptr()];
                if key_path.is_null() {
                    continue;
                }
                let _: () = msg_send![
                    window,
                    addObserver: &*observer,
                    forKeyPath: key_path,
                    options: 0usize,
                    context: std::ptr::null_mut::<c_void>()
                ];
                let _: () = msg_send![window, removeObserver: &*observer, forKeyPath: key_path];
            }
        }
        true
    }

    /// Turns Tauri's window into the non-activating panel class when that is safe.
    unsafe fn become_panel(window: &AnyObject, label: &str) {
        let current = window.class();
        let observed = match kind_of(window) {
            WindowKind::OverlayPanel { .. } => return,
            WindowKind::TauriWindow { observed } => observed,
            WindowKind::Unknown => {
                tracing::warn!(
                    "Overlay window {label}: unexpected window class {:?}, kept as a window",
                    current.name()
                );
                return;
            }
        };
        let Some(panel) = panel_class() else {
            tracing::warn!("Overlay window {label}: the panel class could not be created");
            return;
        };
        // Compare Tauri's own class (under the KVO class, if any) with the panel class.
        let tauri_class = match current.superclass() {
            Some(superclass) if observed => superclass,
            _ => current,
        };
        if !panel_swap_is_safe(layout(current), layout(panel))
            || !panel_swap_is_safe(layout(tauri_class), layout(panel))
        {
            tracing::warn!("Overlay window {label}: window layout differs, kept as a window");
            return;
        }
        let mut keys = Vec::new();
        if observed {
            keys = observed_keys(current);
            if keys.is_empty() {
                keys.push(FALLBACK_KVO_KEY.to_string());
            }
            swapped_panels().insert(
                address(window),
                SwappedPanel {
                    old_class: current as *const AnyClass as usize,
                    added: Vec::new(),
                },
            );
        }
        // SAFETY: the panel class is a subclass of NSPanel (itself an NSWindow subclass) with
        // the same size and the same `focusable` variable at the same place, checked above.
        unsafe { AnyObject::set_class(window, panel) };
        if observed {
            let reobserved = unsafe { reobserve(window, &keys) };
            if !reobserved || kind_of(window) != (WindowKind::OverlayPanel { observed: true }) {
                // Back to exactly the state before the swap.
                // SAFETY: that class described this very object a moment ago.
                unsafe { AnyObject::set_class(window, current) };
                swapped_panels().remove(&address(window));
                tracing::warn!(
                    "Overlay window {label}: key-value observing could not be moved to the \
                     panel, kept as a window"
                );
                return;
            }
        }
        // Panels hide when their app is inactive by default; the pill must not.
        let _: () = unsafe { msg_send![window, setHidesOnDeactivate: false] };
        tracing::info!(
            "Overlay window {label}: now a non-activating panel (was {:?}, now {:?})",
            current.name(),
            window.class().name()
        );
    }

    pub unsafe fn apply(ns_window: *mut AnyObject, label: &str) {
        // SAFETY: the caller passes a live NSWindow.
        let Some(window) = (unsafe { ns_window.as_ref() }) else {
            return;
        };
        unsafe { become_panel(window, label) };
        let is_panel = matches!(kind_of(window), WindowKind::OverlayPanel { .. });
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

    #[test]
    fn tauris_window_class_is_recognised_with_or_without_kvo() {
        // What a live Tauri window reports (seen in the log of the real app).
        let observed = [
            "NSKVONotifying_TaoWindow",
            "TaoWindow",
            "NSWindow",
            "NSResponder",
            "NSObject",
        ];
        assert_eq!(
            classify_window_class(&observed),
            WindowKind::TauriWindow { observed: true }
        );
        assert_eq!(
            classify_window_class(&["TaoWindow", "NSWindow", "NSResponder", "NSObject"]),
            WindowKind::TauriWindow { observed: false }
        );
    }

    #[test]
    fn a_swapped_panel_is_recognised_so_the_swap_runs_once() {
        let chain = [
            "NSKVONotifying_TypeliteOverlayPanel",
            "TypeliteOverlayPanel",
            "NSPanel",
            "NSWindow",
        ];
        assert_eq!(
            classify_window_class(&chain),
            WindowKind::OverlayPanel { observed: true }
        );
        assert_eq!(
            classify_window_class(&chain[1..]),
            WindowKind::OverlayPanel { observed: false }
        );
    }

    #[test]
    fn other_classes_and_mismatched_kvo_classes_are_left_alone() {
        for chain in [
            &["NSWindow", "NSResponder", "NSObject"][..],
            &["NSPanel", "NSWindow"],
            // A KVO class must sit directly on the class it is named after.
            &["NSKVONotifying_TaoWindow", "NSWindow"],
            &["NSKVONotifying_NSWindow", "NSWindow"],
            &["NSKVONotifying_", "TaoWindow"],
            &["NSKVONotifying_TaoWindow"],
            // Some other subclass of Tauri's class.
            &["MyWindow", "TaoWindow", "NSWindow"],
            &[],
        ] {
            assert_eq!(
                classify_window_class(chain),
                WindowKind::Unknown,
                "{chain:?}"
            );
        }
    }

    #[test]
    fn kvo_keys_come_from_the_setters_only() {
        // The methods of the real NSKVONotifying_TaoWindow, plus a few made-up ones.
        let methods = [
            "setContentView:",
            "class",
            "dealloc",
            "_isKVOA",
            "setTitle:",
            "setURL:",
            "setTitle:",
            "set:",
            "setup",
            "setFrame:display:",
            "settle:",
        ];
        assert_eq!(
            kvo_keys_from_methods(methods),
            vec!["URL".to_string(), "contentView".into(), "title".into()]
        );
        assert!(kvo_keys_from_methods(["class", "dealloc", "_isKVOA"]).is_empty());
    }

    fn observation(observer: usize, key_path: &str, context: usize) -> Observation {
        Observation {
            observer,
            key_path: key_path.to_string(),
            context,
        }
    }

    #[test]
    fn observers_from_before_the_swap_are_removed_under_the_old_class() {
        let mut records = vec![observation(1, "title", 0)];
        // Not registered after the swap: another observer, another key, another context.
        assert!(!take_observation(&mut records, 2, "title", None));
        assert!(!take_observation(&mut records, 1, "contentView", None));
        assert!(!take_observation(&mut records, 1, "title", Some(7)));
        assert_eq!(records.len(), 1);
        // Registered after the swap: removed normally, and only once.
        assert!(take_observation(&mut records, 1, "title", Some(0)));
        assert!(records.is_empty());
        assert!(!take_observation(&mut records, 1, "title", None));
    }

    #[test]
    fn a_removal_without_context_takes_the_latest_registration() {
        let mut records = vec![
            observation(1, "title", 10),
            observation(1, "level", 10),
            observation(1, "title", 20),
        ];
        assert!(take_observation(&mut records, 1, "title", None));
        assert_eq!(
            records,
            vec![observation(1, "title", 10), observation(1, "level", 10)]
        );
        // With a context, exactly that registration.
        assert!(take_observation(&mut records, 1, "title", Some(10)));
        assert_eq!(records, vec![observation(1, "level", 10)]);
    }
}
