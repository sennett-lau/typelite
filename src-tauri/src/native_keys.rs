//! Table of macOS keys the native shortcut listener understands.
//!
//! # Background for readers new to macOS
//!
//! **Virtual keycodes.** Every physical key on a Mac keyboard has a fixed number, the
//! *virtual keycode* (Apple's `kVK_*` constants in `HIToolbox/Events.h`). The number names the
//! key position, not the character it types: `kVK_ANSI_A` is 0 whether the layout is QWERTY or
//! AZERTY. The numbers look random (A is 0, S is 1, End is 119) because they come from the
//! original Apple keyboard scan codes. This table lists the ones we can bind.
//!
//! **Two kinds of key events.** A `CGEventTap` (see `native_hotkey.rs`) receives:
//! - `kCGEventKeyDown` / `kCGEventKeyUp` for normal keys (letters, End, F13, Space …). The
//!   keycode is in the event field `kCGKeyboardEventKeycode`. Holding a key produces repeated
//!   key-down events with `kCGKeyboardEventAutorepeat` set.
//! - `kCGEventFlagsChanged` for modifier keys (Shift, Control, Option, Command, Fn). macOS does
//!   not send key-down/key-up for these. Instead it sends one "flags changed" event each time a
//!   modifier goes down or up. The event still carries the keycode of the modifier that changed,
//!   and its *flags* (`CGEventGetFlags`) describe which modifiers are held now. So "was the key
//!   pressed or released?" is answered by checking whether that modifier's flag bit is set.
//!
//! **Device-dependent flag bits.** The well-known flag bits (`kCGEventFlagMaskShift` = 0x20000
//! and friends) only say "some Shift is held". The low 16 bits of the flags are
//! *device-dependent* bits from IOKit (`NX_DEVICELSHIFTKEYMASK` …) and say which side is held.
//! Apple does not document them in CoreGraphics, but they have been stable since NeXTSTEP and
//! every macOS hotkey tool relies on them. `device_flag` below holds that bit for each
//! side-specific modifier, which is how we tell Right Shift apart from Left Shift.
//!
//! Fn (the Globe key) has no side; it uses `kCGEventFlagMaskSecondaryFn` (0x800000).
//!
//! The names are the canonical names stored in settings (`ShortcutBinding`) and shown in the
//! UI. The frontend keeps a matching list in `src/stores/appStore.ts`.

/// One bindable key.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NativeKey {
    /// macOS virtual keycode (`kVK_*`).
    pub code: u16,
    /// Canonical name used in settings and in `hotkey:capture` events.
    pub name: &'static str,
    /// Reported through `kCGEventFlagsChanged` instead of key-down/key-up.
    pub is_modifier: bool,
    /// For modifiers: the flag bit that is set while this exact key is held.
    pub device_flag: Option<u64>,
    /// The key does nothing useful on its own while typing (End, Home, F13 …), so it may be a
    /// shortcut by itself, and the listener swallows it whenever it is bound. Keys that type or
    /// edit text (letters, Space, Enter, arrows …) are only swallowed when they complete a
    /// bound chord, and need a modifier to be bound.
    pub standalone: bool,
}

/// `kCGEventFlagMaskSecondaryFn`: set while Fn / Globe is held.
pub const FLAG_FN: u64 = 0x0080_0000;
// Device-dependent bits (IOKit `NX_DEVICE*KEYMASK`).
pub const FLAG_DEVICE_LEFT_CONTROL: u64 = 0x0000_0001;
pub const FLAG_DEVICE_LEFT_SHIFT: u64 = 0x0000_0002;
pub const FLAG_DEVICE_RIGHT_SHIFT: u64 = 0x0000_0004;
pub const FLAG_DEVICE_LEFT_COMMAND: u64 = 0x0000_0008;
pub const FLAG_DEVICE_RIGHT_COMMAND: u64 = 0x0000_0010;
pub const FLAG_DEVICE_LEFT_OPTION: u64 = 0x0000_0020;
pub const FLAG_DEVICE_RIGHT_OPTION: u64 = 0x0000_0040;
pub const FLAG_DEVICE_RIGHT_CONTROL: u64 = 0x0000_2000;

/// `kVK_Escape`. Pressing it during capture cancels the capture.
pub const ESCAPE_KEYCODE: u16 = 53;

const fn modifier(code: u16, name: &'static str, flag: u64) -> NativeKey {
    NativeKey {
        code,
        name,
        is_modifier: true,
        device_flag: Some(flag),
        standalone: false,
    }
}

const fn standalone(code: u16, name: &'static str) -> NativeKey {
    NativeKey {
        code,
        name,
        is_modifier: false,
        device_flag: None,
        standalone: true,
    }
}

const fn typing(code: u16, name: &'static str) -> NativeKey {
    NativeKey {
        code,
        name,
        is_modifier: false,
        device_flag: None,
        standalone: false,
    }
}

/// Every key the listener can bind. CapsLock (57) is deliberately missing: it toggles a lock
/// state rather than being held, and its flagsChanged events would confuse chord tracking.
pub const NATIVE_KEYS: &[NativeKey] = &[
    // Modifiers (flagsChanged).
    modifier(63, "Fn", FLAG_FN),
    modifier(56, "LeftShift", FLAG_DEVICE_LEFT_SHIFT),
    modifier(60, "RightShift", FLAG_DEVICE_RIGHT_SHIFT),
    modifier(59, "LeftControl", FLAG_DEVICE_LEFT_CONTROL),
    modifier(62, "RightControl", FLAG_DEVICE_RIGHT_CONTROL),
    modifier(58, "LeftOption", FLAG_DEVICE_LEFT_OPTION),
    modifier(61, "RightOption", FLAG_DEVICE_RIGHT_OPTION),
    modifier(55, "LeftCommand", FLAG_DEVICE_LEFT_COMMAND),
    modifier(54, "RightCommand", FLAG_DEVICE_RIGHT_COMMAND),
    // Keys that are safe to use alone.
    standalone(119, "End"),
    standalone(115, "Home"),
    standalone(116, "PageUp"),
    standalone(121, "PageDown"),
    standalone(114, "Insert"), // kVK_Help: the key labelled Insert on PC keyboards.
    standalone(122, "F1"),
    standalone(120, "F2"),
    standalone(99, "F3"),
    standalone(118, "F4"),
    standalone(96, "F5"),
    standalone(97, "F6"),
    standalone(98, "F7"),
    standalone(100, "F8"),
    standalone(101, "F9"),
    standalone(109, "F10"),
    standalone(103, "F11"),
    standalone(111, "F12"),
    standalone(105, "F13"),
    standalone(107, "F14"),
    standalone(113, "F15"),
    standalone(106, "F16"),
    standalone(64, "F17"),
    standalone(79, "F18"),
    standalone(80, "F19"),
    standalone(90, "F20"),
    // Keys that type or edit text.
    typing(49, "Space"),
    typing(53, "Escape"),
    typing(48, "Tab"),
    typing(36, "Enter"),
    typing(51, "Backspace"), // kVK_Delete: the key above Return.
    typing(117, "Delete"),   // kVK_ForwardDelete.
    typing(126, "Up"),
    typing(125, "Down"),
    typing(123, "Left"),
    typing(124, "Right"),
    typing(0, "A"),
    typing(11, "B"),
    typing(8, "C"),
    typing(2, "D"),
    typing(14, "E"),
    typing(3, "F"),
    typing(5, "G"),
    typing(4, "H"),
    typing(34, "I"),
    typing(38, "J"),
    typing(40, "K"),
    typing(37, "L"),
    typing(46, "M"),
    typing(45, "N"),
    typing(31, "O"),
    typing(35, "P"),
    typing(12, "Q"),
    typing(15, "R"),
    typing(1, "S"),
    typing(17, "T"),
    typing(32, "U"),
    typing(9, "V"),
    typing(13, "W"),
    typing(7, "X"),
    typing(16, "Y"),
    typing(6, "Z"),
    typing(29, "0"),
    typing(18, "1"),
    typing(19, "2"),
    typing(20, "3"),
    typing(21, "4"),
    typing(23, "5"),
    typing(22, "6"),
    typing(26, "7"),
    typing(28, "8"),
    typing(25, "9"),
    typing(44, "/"),
    typing(42, "\\"),
    typing(47, "."),
    typing(43, ","),
    typing(41, ";"),
    typing(39, "'"),
    typing(50, "`"),
    typing(27, "-"),
    typing(24, "="),
    typing(33, "["),
    typing(30, "]"),
];

/// Look a key up by its canonical name (case-insensitive). `RightAlt` (the Windows name) is
/// accepted as an alias for `RightOption`.
pub fn key_by_name(name: &str) -> Option<&'static NativeKey> {
    let name = name.trim();
    let name = if name.eq_ignore_ascii_case("RightAlt") {
        "RightOption"
    } else {
        name
    };
    NATIVE_KEYS
        .iter()
        .find(|key| key.name.eq_ignore_ascii_case(name))
}

/// Look a key up by its macOS virtual keycode.
pub fn key_by_code(code: u16) -> Option<&'static NativeKey> {
    NATIVE_KEYS.iter().find(|key| key.code == code)
}

/// True for keys that only the native listener can watch on macOS: Fn, side-specific
/// modifiers, End/Home/PageUp/PageDown and F13–F20. A binding that contains one of them must
/// go through the event tap; `tauri-plugin-global-shortcut` cannot register it (or, for End
/// and Home, cannot swallow it reliably).
pub fn is_native_only(key: &NativeKey) -> bool {
    key.is_modifier
        || matches!(
            key.name,
            "End"
                | "Home"
                | "PageUp"
                | "PageDown"
                | "F13"
                | "F14"
                | "F15"
                | "F16"
                | "F17"
                | "F18"
                | "F19"
                | "F20"
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_and_names_are_unique() {
        for (i, a) in NATIVE_KEYS.iter().enumerate() {
            for b in &NATIVE_KEYS[i + 1..] {
                assert_ne!(a.code, b.code, "{} and {} share a keycode", a.name, b.name);
                assert_ne!(a.name, b.name);
            }
        }
    }

    #[test]
    fn looks_up_the_users_keys() {
        assert_eq!(key_by_name("End").unwrap().code, 119);
        assert_eq!(key_by_name("rightshift").unwrap().code, 60);
        assert_eq!(
            key_by_name("RightControl").unwrap().device_flag,
            Some(FLAG_DEVICE_RIGHT_CONTROL)
        );
        assert_eq!(key_by_code(63).unwrap().name, "Fn");
        assert_eq!(key_by_name("RightAlt").unwrap().name, "RightOption");
        assert!(key_by_code(57).is_none(), "CapsLock must be ignored");
    }

    #[test]
    fn classifies_native_only_keys() {
        assert!(is_native_only(key_by_name("End").unwrap()));
        assert!(is_native_only(key_by_name("F13").unwrap()));
        assert!(is_native_only(key_by_name("LeftShift").unwrap()));
        assert!(!is_native_only(key_by_name("F5").unwrap()));
        assert!(!is_native_only(key_by_name("K").unwrap()));
    }
}
