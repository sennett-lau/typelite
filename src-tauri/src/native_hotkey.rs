//! Native keyboard listener for shortcuts that `tauri-plugin-global-shortcut` cannot handle:
//! Fn, End, F13–F20, side-specific modifiers (Right Shift …) and chords of them.
//!
//! # How it works on macOS
//!
//! A **`CGEventTap`** is a hook that CoreGraphics (the macOS window server client library)
//! calls for every input event before the focused app sees it. We create one at the
//! "session" level with `CGEventTapCreate`, add it to a `CFRunLoop` on a background thread,
//! and our callback runs for each key event. The callback may return the event unchanged
//! (the app receives it) or return null, which **swallows** the event (the app never sees
//! it). That is how bare End can start dictation without also moving the cursor.
//!
//! Creating a tap that can see and swallow keys needs the **Accessibility** permission. If
//! the permission is missing, `CGEventTapCreate` returns null, and the tap must be created
//! again after the user grants it (see `CLAUDE.md`, "Lessons learned").
//!
//! macOS reports normal keys with key-down / key-up events and modifier keys with
//! `flagsChanged` events; see `native_keys.rs` for keycodes and the device-dependent flag bits
//! that tell Right Shift from Left Shift.
//!
//! # Structure
//!
//! Everything that decides *what happens* is plain Rust with unit tests:
//! - [`ChordMatcher`] turns key edges into `Pressed` / `Released` events for bindings.
//! - [`CaptureState`] turns key edges into `hotkey:capture` events while the settings window
//!   records a new shortcut.
//! - [`TapLogic::process_mac_event`] turns a raw macOS event (type, keycode, flags) into those
//!   calls and a swallow decision.
//!
//! The `platform` modules only talk to the OS and call these functions.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use crate::native_keys;
use serde::Serialize;
use std::collections::BTreeSet;
use std::sync::{Arc, Mutex};
use tauri_plugin_global_shortcut::ShortcutState;

/// Most keys a chord may have: a base key plus two extra keys.
pub const MAX_CHORD_KEYS: usize = 3;

/// A set of physical keys that must all be held at the same time, identified by platform
/// keycode (macOS virtual keycode, or a Windows virtual-key code on Windows). Kept sorted
/// and without duplicates, so two chords with the same keys are equal whatever order the
/// keys were written or pressed in.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct NativeChord {
    pub keys: Vec<u16>,
}

impl NativeChord {
    pub fn new(keys: impl IntoIterator<Item = u16>) -> Option<Self> {
        let keys: BTreeSet<u16> = keys.into_iter().collect();
        if keys.is_empty() {
            return None;
        }
        Some(Self {
            keys: keys.into_iter().collect(),
        })
    }

    pub fn contains(&self, code: u16) -> bool {
        self.keys.binary_search(&code).is_ok()
    }

    fn is_satisfied_by(&self, held: &BTreeSet<u16>) -> bool {
        self.keys.iter().all(|code| held.contains(code))
    }

    fn is_strict_subset_of(&self, other: &NativeChord) -> bool {
        self.keys.len() < other.keys.len() && self.keys.iter().all(|code| other.contains(*code))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeHotkeyBinding {
    pub role: crate::hotkey::HotkeyRole,
    pub index: usize,
    pub chord: NativeChord,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NativeHotkeyEvent {
    pub role: crate::hotkey::HotkeyRole,
    pub index: usize,
    pub state: ShortcutState,
}

/// How a key behaves when it is part of a binding.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyClass {
    /// Shift, Control, Option, Command, Fn. Never swallowed: dropping a modifier event can
    /// leave other apps thinking the modifier is still held.
    Modifier,
    /// Types or edits text (letters, Space, arrows …). Swallowed only when the press
    /// completes a bound chord, so normal typing keeps working.
    Typing,
    /// Useless on its own while typing (End, F13 …). Always swallowed while it is bound.
    Standalone,
}

/// One key edge, already decoded from the platform event.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KeyInput {
    pub code: u16,
    pub pressed: bool,
    /// A repeated key-down produced by holding the key.
    pub autorepeat: bool,
    pub class: KeyClass,
}

/// Tells the matcher whether the Switch language bindings are live right now (a Translate
/// recording is running). Called on the key listener thread for each key press, so it must be
/// quick and must not wait on anything that waits on the listener.
pub type SwitchGate = Arc<dyn Fn() -> bool + Send + Sync + 'static>;

/// Tells the matcher whether a run (recording or processing) is active right now, so the cancel
/// key (Escape) should stop it. Same rules as [`SwitchGate`]: quick, and never waits on the
/// listener.
pub type CancelGate = Arc<dyn Fn() -> bool + Send + Sync + 'static>;

/// Matches held keys against the configured chords.
///
/// Rules:
/// - A binding is *satisfied* when all its keys are held. After a key goes down, the
///   satisfied binding with the largest chord that contains that key wins.
/// - If the winner's chord is a strict subset of another binding's chord (bare `End` while
///   `End + Right Shift` is also bound), its `Pressed` is **deferred**: it fires, followed at
///   once by `Released`, when one of its keys goes up, unless a larger chord is satisfied
///   first. Then the smaller one is dropped, and it cannot fire again until its keys are
///   pressed again.
/// - Otherwise the winner fires `Pressed` at once, and `Released` when any of its keys goes up.
/// - Switch language bindings count only while the [`SwitchGate`] says a Translate recording
///   runs. At other times they are ignored completely, so a bare key like Shift types as
///   usual. Only a key *press* seen while the gate is open can trigger them, so a key that was
///   already held when the recording started (part of the Translate chord) never counts.
///   While they are live, a key press they win is swallowed, even a modifier; its release is
///   swallowed too, so the focused app never sees half of the key.
/// - The cancel key (Escape, see [`ChordMatcher::with_cancel_key`]) counts only while the
///   [`CancelGate`] says a run is active. Then its press fires a `Cancel` event and is
///   swallowed together with its repeats and its release. At other times it is not touched.
pub struct ChordMatcher {
    bindings: Vec<NativeHotkeyBinding>,
    /// Per binding: another binding has a larger chord that contains it, with the Switch
    /// language bindings left out (`idle`) or included (`armed`).
    has_superset_idle: Vec<bool>,
    has_superset_armed: Vec<bool>,
    bound_keys_idle: BTreeSet<u16>,
    bound_keys_armed: BTreeSet<u16>,
    held: BTreeSet<u16>,
    active: Vec<usize>,
    deferred: Vec<usize>,
    swallowed: BTreeSet<u16>,
    switch_gate: Option<SwitchGate>,
    cancel_key: Option<(u16, CancelGate)>,
    /// The cancel key's press was swallowed, so its repeats and release are swallowed too.
    cancel_key_down: bool,
}

fn is_switch_role(binding: &NativeHotkeyBinding) -> bool {
    binding.role == crate::hotkey::HotkeyRole::SwitchLanguage
}

impl ChordMatcher {
    pub fn new(bindings: Vec<NativeHotkeyBinding>) -> Self {
        let has_superset = |include_switch: bool| -> Vec<bool> {
            bindings
                .iter()
                .map(|binding| {
                    bindings.iter().any(|other| {
                        (include_switch || !is_switch_role(other))
                            && binding.chord.is_strict_subset_of(&other.chord)
                    })
                })
                .collect()
        };
        let bound_keys = |include_switch: bool| -> BTreeSet<u16> {
            bindings
                .iter()
                .filter(|binding| include_switch || !is_switch_role(binding))
                .flat_map(|binding| binding.chord.keys.iter().copied())
                .collect()
        };
        Self {
            has_superset_idle: has_superset(false),
            has_superset_armed: has_superset(true),
            bound_keys_idle: bound_keys(false),
            bound_keys_armed: bound_keys(true),
            bindings,
            held: BTreeSet::new(),
            active: Vec::new(),
            deferred: Vec::new(),
            swallowed: BTreeSet::new(),
            switch_gate: None,
            cancel_key: None,
            cancel_key_down: false,
        }
    }

    /// Use `gate` to decide when the Switch language bindings are live. Without a gate they
    /// never are.
    pub fn with_switch_gate(mut self, gate: SwitchGate) -> Self {
        self.switch_gate = Some(gate);
        self
    }

    /// Make `code` the cancel key: while `gate` says a run is active, pressing it fires a
    /// [`crate::hotkey::HotkeyRole::Cancel`] event and the key is swallowed.
    pub fn with_cancel_key(mut self, code: u16, gate: CancelGate) -> Self {
        self.cancel_key = Some((code, gate));
        self
    }

    /// Handles the cancel key. Returns the swallow decision, or `None` when the key is not the
    /// cancel key or no run is active (then the event is handled as usual).
    fn handle_cancel_key(
        &mut self,
        input: KeyInput,
        events: &mut Vec<NativeHotkeyEvent>,
    ) -> Option<bool> {
        let (code, gate) = self.cancel_key.as_ref()?;
        if input.code != *code {
            return None;
        }
        if !input.pressed {
            return std::mem::take(&mut self.cancel_key_down).then_some(true);
        }
        if self.cancel_key_down {
            // Autorepeat (or a doubled key-down) of a press that already cancelled.
            return Some(true);
        }
        if input.autorepeat || !gate() {
            return None;
        }
        self.cancel_key_down = true;
        events.push(NativeHotkeyEvent {
            role: crate::hotkey::HotkeyRole::Cancel,
            index: 0,
            state: ShortcutState::Pressed,
        });
        Some(true)
    }

    fn switch_armed(&self) -> bool {
        self.bindings.iter().any(is_switch_role)
            && self.switch_gate.as_ref().is_some_and(|gate| gate())
    }

    /// Keys currently believed to be held.
    pub fn held_codes(&self) -> Vec<u16> {
        self.held.iter().copied().collect()
    }

    /// Feed one key edge. Pushes the resulting events and returns true when the platform
    /// event should be swallowed.
    pub fn handle(&mut self, input: KeyInput, events: &mut Vec<NativeHotkeyEvent>) -> bool {
        if let Some(swallow) = self.handle_cancel_key(input, events) {
            return swallow;
        }
        if input.pressed {
            self.press(input, events)
        } else {
            self.release(input.code, events)
        }
    }

    /// Forget all held keys (for example after the OS disabled the tap and events were lost),
    /// releasing any binding that is still active.
    pub fn reset(&mut self, events: &mut Vec<NativeHotkeyEvent>) {
        for index in std::mem::take(&mut self.active) {
            events.push(self.event(index, ShortcutState::Released));
        }
        self.deferred.clear();
        self.held.clear();
        self.swallowed.clear();
        self.cancel_key_down = false;
    }

    fn event(&self, index: usize, state: ShortcutState) -> NativeHotkeyEvent {
        let binding = &self.bindings[index];
        NativeHotkeyEvent {
            role: binding.role,
            index: binding.index,
            state,
        }
    }

    fn press(&mut self, input: KeyInput, events: &mut Vec<NativeHotkeyEvent>) -> bool {
        let code = input.code;
        let armed = self.switch_armed();
        let bound_keys = if armed {
            &self.bound_keys_armed
        } else {
            &self.bound_keys_idle
        };
        let always_swallow = input.class == KeyClass::Standalone && bound_keys.contains(&code);
        if input.autorepeat || self.held.contains(&code) {
            return always_swallow || self.swallowed.contains(&code);
        }
        self.held.insert(code);

        let winner = self.newly_satisfied_largest(code, armed);
        let switch_won = winner.is_some_and(|index| is_switch_role(&self.bindings[index]));
        let swallow = match input.class {
            KeyClass::Modifier => switch_won,
            KeyClass::Standalone => always_swallow,
            KeyClass::Typing => winner.is_some(),
        };
        if swallow {
            self.swallowed.insert(code);
        }

        let Some(index) = winner else {
            return swallow;
        };
        let chord = self.bindings[index].chord.clone();
        let bindings = &self.bindings;
        self.deferred
            .retain(|deferred| !bindings[*deferred].chord.is_strict_subset_of(&chord));
        let has_superset = if armed {
            self.has_superset_armed[index]
        } else {
            self.has_superset_idle[index]
        };
        if has_superset {
            if !self.deferred.contains(&index) {
                self.deferred.push(index);
            }
        } else if !self.active.contains(&index) {
            self.active.push(index);
            events.push(self.event(index, ShortcutState::Pressed));
        }
        swallow
    }

    fn release(&mut self, code: u16, events: &mut Vec<NativeHotkeyEvent>) -> bool {
        let swallow = self.swallowed.remove(&code);
        if !self.held.remove(&code) {
            return swallow;
        }

        let (fire, keep): (Vec<usize>, Vec<usize>) = self
            .deferred
            .iter()
            .copied()
            .partition(|index| self.bindings[*index].chord.contains(code));
        self.deferred = keep;
        for index in fire {
            events.push(self.event(index, ShortcutState::Pressed));
            events.push(self.event(index, ShortcutState::Released));
        }

        let (release, keep): (Vec<usize>, Vec<usize>) = self
            .active
            .iter()
            .copied()
            .partition(|index| self.bindings[*index].chord.contains(code));
        self.active = keep;
        for index in release {
            events.push(self.event(index, ShortcutState::Released));
        }
        swallow
    }

    /// The largest binding that contains `code` and is satisfied now. Such a binding cannot
    /// have been satisfied before `code` went down. Ties keep the first configured binding.
    /// Switch language bindings take part only when `armed`.
    fn newly_satisfied_largest(&self, code: u16, armed: bool) -> Option<usize> {
        let mut best: Option<usize> = None;
        for (index, binding) in self.bindings.iter().enumerate() {
            if (!armed && is_switch_role(binding))
                || !binding.chord.contains(code)
                || !binding.chord.is_satisfied_by(&self.held)
            {
                continue;
            }
            let larger = best
                .map(|current| binding.chord.keys.len() > self.bindings[current].chord.keys.len())
                .unwrap_or(true);
            if larger {
                best = Some(index);
            }
        }
        best
    }
}

/// Payload of the `hotkey:capture` event sent to the settings window.
///
/// - While keys are held: `held` lists their names in press order, `finished: false`.
/// - When the last key goes up: `finished: true` and `held` is the largest set that was held
///   at one time (the latest one if several had the same size).
/// - When Escape is pressed: `cancelled: true`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ShortcutCaptureEvent {
    pub held: Vec<String>,
    pub finished: bool,
    pub cancelled: bool,
}

/// Records the keys the user presses while a shortcut field is capturing (macOS only).
#[derive(Debug, Default)]
pub struct CaptureState {
    held: Vec<u16>,
    peak: Vec<u16>,
    done: bool,
}

fn key_names(codes: &[u16]) -> Vec<String> {
    codes
        .iter()
        .filter_map(|code| native_keys::key_by_code(*code))
        .map(|key| key.name.to_string())
        .collect()
}

impl CaptureState {
    pub fn held_codes(&self) -> Vec<u16> {
        self.held.clone()
    }

    /// Feed one key edge. Returns the event to send (if any) and whether to swallow the
    /// platform event. Every non-modifier key is swallowed while capturing, so the keys do
    /// not also type into the settings window.
    pub fn handle(&mut self, input: KeyInput) -> (Option<ShortcutCaptureEvent>, bool) {
        let swallow = input.class != KeyClass::Modifier;
        if self.done {
            return (None, swallow);
        }

        if input.pressed {
            if input.code == native_keys::ESCAPE_KEYCODE {
                self.done = true;
                return (
                    Some(ShortcutCaptureEvent {
                        held: key_names(&self.held),
                        finished: false,
                        cancelled: true,
                    }),
                    swallow,
                );
            }
            if input.autorepeat
                || self.held.contains(&input.code)
                || native_keys::key_by_code(input.code).is_none()
                || self.held.len() >= MAX_CHORD_KEYS
            {
                return (None, swallow);
            }
            self.held.push(input.code);
            if self.held.len() >= self.peak.len() {
                self.peak = self.held.clone();
            }
            return (Some(self.progress_event()), swallow);
        }

        // Keys that went down before the capture started are not ours; ignore their release.
        let Some(position) = self.held.iter().position(|code| *code == input.code) else {
            return (None, swallow);
        };
        self.held.remove(position);
        if self.held.is_empty() {
            self.done = true;
            return (
                Some(ShortcutCaptureEvent {
                    held: key_names(&self.peak),
                    finished: true,
                    cancelled: false,
                }),
                swallow,
            );
        }
        (Some(self.progress_event()), swallow)
    }

    /// Start over after the OS disabled the tap (events may have been lost).
    pub fn reset(&mut self) {
        self.held.clear();
        self.peak.clear();
    }

    fn progress_event(&self) -> ShortcutCaptureEvent {
        ShortcutCaptureEvent {
            held: key_names(&self.held),
            finished: false,
            cancelled: false,
        }
    }
}

/// The three kinds of macOS keyboard events the tap listens to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MacEventKind {
    KeyDown,
    KeyUp,
    FlagsChanged,
}

/// The raw fields the tap callback reads from a macOS keyboard event.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MacKeyEvent {
    pub kind: MacEventKind,
    /// `kCGKeyboardEventKeycode`.
    pub keycode: u16,
    /// `CGEventGetFlags`: which modifiers are held after this event.
    pub flags: u64,
    /// `kCGKeyboardEventAutorepeat` (key-down only).
    pub autorepeat: bool,
}

/// Decode a macOS event into a key edge. Returns `None` for keys we do not track
/// (CapsLock, and flagsChanged events for unknown keys).
pub fn mac_key_input(event: MacKeyEvent) -> Option<KeyInput> {
    match event.kind {
        MacEventKind::FlagsChanged => {
            // A flagsChanged event says "the modifier with this keycode changed". Whether it
            // went down or up is read from its own flag bit in the new flags.
            let key = native_keys::key_by_code(event.keycode)?;
            if !key.is_modifier {
                return None;
            }
            let flag = key.device_flag?;
            Some(KeyInput {
                code: event.keycode,
                pressed: (event.flags & flag) != 0,
                autorepeat: false,
                class: KeyClass::Modifier,
            })
        }
        MacEventKind::KeyDown | MacEventKind::KeyUp => {
            let class = match native_keys::key_by_code(event.keycode) {
                Some(key) if key.is_modifier => return None,
                Some(key) if key.standalone => KeyClass::Standalone,
                _ => KeyClass::Typing,
            };
            Some(KeyInput {
                code: event.keycode,
                pressed: event.kind == MacEventKind::KeyDown,
                autorepeat: event.kind == MacEventKind::KeyDown && event.autorepeat,
                class,
            })
        }
    }
}

/// Side-specific modifiers whose held state disagrees with `flags`. Returns
/// `(keycode, now_pressed)` pairs. Fn is left out because its flag bit is also set on
/// arrow and function-key events that have nothing to do with the Fn key.
fn modifier_mismatches(held: &[u16], flags: u64) -> Vec<(u16, bool)> {
    native_keys::NATIVE_KEYS
        .iter()
        .filter(|key| key.is_modifier && key.name != "Fn")
        .filter_map(|key| {
            let flag = key.device_flag?;
            let down = (flags & flag) != 0;
            (down != held.contains(&key.code)).then_some((key.code, down))
        })
        .collect()
}

/// What the tap is doing: matching configured shortcuts, or capturing a new one.
pub enum TapLogic {
    Hotkeys(ChordMatcher),
    Capture(CaptureState),
}

/// Result of one tap callback: whether to swallow the event and what to send.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct TapOutput {
    pub swallow: bool,
    pub hotkey_events: Vec<NativeHotkeyEvent>,
    pub capture_events: Vec<ShortcutCaptureEvent>,
}

impl TapLogic {
    fn held_codes(&self) -> Vec<u16> {
        match self {
            Self::Hotkeys(matcher) => matcher.held_codes(),
            Self::Capture(capture) => capture.held_codes(),
        }
    }

    fn feed(&mut self, input: KeyInput, output: &mut TapOutput) -> bool {
        match self {
            Self::Hotkeys(matcher) => matcher.handle(input, &mut output.hotkey_events),
            Self::Capture(capture) => {
                let (event, swallow) = capture.handle(input);
                output.capture_events.extend(event);
                swallow
            }
        }
    }

    /// Process one macOS keyboard event.
    ///
    /// Before the event itself, held modifiers are brought in line with the event's flags:
    /// a key event adds a modifier that is down but was never seen going down (for example
    /// Right Shift held before the tap started, then End pressed), and a flagsChanged event
    /// drops a modifier whose release was missed. Without this, one lost event would leave a
    /// chord stuck.
    pub fn process_mac_event(&mut self, event: MacKeyEvent) -> TapOutput {
        let mut output = TapOutput::default();
        let held = self.held_codes();
        for (code, down) in modifier_mismatches(&held, event.flags) {
            let allowed = match event.kind {
                MacEventKind::FlagsChanged => !down && code != event.keycode,
                MacEventKind::KeyDown | MacEventKind::KeyUp => down,
            };
            if allowed {
                let input = KeyInput {
                    code,
                    pressed: down,
                    autorepeat: false,
                    class: KeyClass::Modifier,
                };
                let _ = self.feed(input, &mut output);
            }
        }

        if let Some(input) = mac_key_input(event) {
            output.swallow = self.feed(input, &mut output);
        } else if matches!(self, Self::Capture(_)) && event.kind != MacEventKind::FlagsChanged {
            output.swallow = true;
        }
        output
    }

    /// The OS disabled the tap for a moment, so key events may have been lost.
    pub fn reset(&mut self) -> TapOutput {
        let mut output = TapOutput::default();
        match self {
            Self::Hotkeys(matcher) => matcher.reset(&mut output.hotkey_events),
            Self::Capture(capture) => capture.reset(),
        }
        output
    }
}

pub type NativeHotkeyHandler = Arc<dyn Fn(NativeHotkeyEvent) + Send + Sync + 'static>;
pub type ShortcutCaptureHandler = Arc<dyn Fn(ShortcutCaptureEvent) + Send + Sync + 'static>;

#[derive(Clone, Default)]
pub struct NativeHotkeyRuntime {
    inner: Arc<Mutex<NativeHotkeyRuntimeInner>>,
}

#[derive(Default)]
struct NativeHotkeyRuntimeInner {
    monitor: Option<platform::PlatformNativeMonitor>,
}

impl NativeHotkeyRuntime {
    /// Replace the running listener with one that matches `bindings`. `switch_gate` says when
    /// the Switch language bindings are live. `cancel_gate` says when Escape cancels the
    /// current run (macOS only; with a gate the listener runs even without native bindings).
    pub fn install(
        &self,
        bindings: Vec<NativeHotkeyBinding>,
        switch_gate: SwitchGate,
        cancel_gate: Option<CancelGate>,
        handler: NativeHotkeyHandler,
    ) -> Result<(), String> {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let _ = inner.monitor.take();

        // Escape's keycode is a macOS one; other platforms do not get the cancel key.
        let cancel_gate = cancel_gate.filter(|_| cfg!(target_os = "macos"));
        if bindings.is_empty() && cancel_gate.is_none() {
            return Ok(());
        }

        let mut matcher = ChordMatcher::new(bindings).with_switch_gate(switch_gate);
        if let Some(gate) = cancel_gate {
            matcher = matcher.with_cancel_key(native_keys::ESCAPE_KEYCODE, gate);
        }
        inner.monitor = Some(platform::PlatformNativeMonitor::start(matcher, handler)?);
        Ok(())
    }

    /// Replace the running listener with one that reports every key to `handler` so the
    /// settings window can record a new shortcut. Fails when the tap cannot be created
    /// (Accessibility permission missing) or on platforms without capture support.
    pub fn start_capture(&self, handler: ShortcutCaptureHandler) -> Result<(), String> {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let _ = inner.monitor.take();
        inner.monitor = Some(platform::PlatformNativeMonitor::start_capture(handler)?);
        Ok(())
    }

    pub fn pause(&self) {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let _ = inner.monitor.take();
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{
        CaptureState, ChordMatcher, MacEventKind, MacKeyEvent, NativeHotkeyHandler,
        ShortcutCaptureHandler, TapLogic, TapOutput,
    };
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{mpsc, Arc, Mutex};
    use std::thread;
    use std::time::Duration;

    const STARTUP_TIMEOUT: Duration = Duration::from_secs(3);

    type CgEventMask = u64;
    type CgEventType = u32;
    type CgEventTapLocation = u32;
    type CgEventTapPlacement = u32;
    type CgEventTapOptions = u32;
    type CgEventField = u32;
    type CgEventFlags = u64;
    type CfStringRef = *const c_void;
    type CfAllocatorRef = *const c_void;

    #[repr(C)]
    struct OpaqueCgEvent(c_void);
    type CgEventRef = *mut OpaqueCgEvent;

    #[repr(C)]
    struct OpaqueCfMachPort(c_void);
    type CfMachPortRef = *mut OpaqueCfMachPort;

    #[repr(C)]
    struct OpaqueCfRunLoop(c_void);
    type CfRunLoopRef = *mut OpaqueCfRunLoop;

    #[repr(C)]
    struct OpaqueCfRunLoopSource(c_void);
    type CfRunLoopSourceRef = *mut OpaqueCfRunLoopSource;

    // kCGSessionEventTap: see events for the whole login session.
    const SESSION_EVENT_TAP: CgEventTapLocation = 1;
    // kCGHeadInsertEventTap: run before other taps.
    const HEAD_INSERT: CgEventTapPlacement = 0;
    // kCGEventTapOptionDefault: an active tap that may change or drop events.
    const TAP_OPTION_DEFAULT: CgEventTapOptions = 0;

    const KEY_DOWN: CgEventType = 10;
    const KEY_UP: CgEventType = 11;
    const FLAGS_CHANGED: CgEventType = 12;
    // macOS disables a tap whose callback is too slow, or when secure input starts, and
    // tells the callback with these pseudo event types. We re-enable it.
    const TAP_DISABLED_BY_TIMEOUT: CgEventType = 0xFFFF_FFFE;
    const TAP_DISABLED_BY_USER_INPUT: CgEventType = 0xFFFF_FFFF;

    const KEYBOARD_EVENT_AUTOREPEAT: CgEventField = 8;
    const KEYBOARD_EVENT_KEYCODE: CgEventField = 9;

    type CgEventTapCallBack = extern "C" fn(
        proxy: *mut c_void,
        event_type: CgEventType,
        event: CgEventRef,
        user_info: *mut c_void,
    ) -> CgEventRef;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventTapCreate(
            tap: CgEventTapLocation,
            place: CgEventTapPlacement,
            options: CgEventTapOptions,
            events_of_interest: CgEventMask,
            callback: CgEventTapCallBack,
            user_info: *mut c_void,
        ) -> CfMachPortRef;
        fn CGEventTapEnable(tap: CfMachPortRef, enable: bool);
        fn CGEventGetIntegerValueField(event: CgEventRef, field: CgEventField) -> i64;
        fn CGEventGetFlags(event: CgEventRef) -> CgEventFlags;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFMachPortCreateRunLoopSource(
            allocator: CfAllocatorRef,
            port: CfMachPortRef,
            order: isize,
        ) -> CfRunLoopSourceRef;
        fn CFRunLoopGetCurrent() -> CfRunLoopRef;
        fn CFRunLoopAddSource(rl: CfRunLoopRef, source: CfRunLoopSourceRef, mode: CfStringRef);
        fn CFRunLoopRun();
        fn CFRunLoopStop(rl: CfRunLoopRef);
        fn CFRelease(cf: *const c_void);
        static kCFRunLoopCommonModes: CfStringRef;
    }

    struct MacShutdownHandles {
        tap: Mutex<Option<CfMachPortRef>>,
        runloop: Mutex<Option<CfRunLoopRef>>,
        cancelled: AtomicBool,
    }

    unsafe impl Send for MacShutdownHandles {}
    unsafe impl Sync for MacShutdownHandles {}

    impl MacShutdownHandles {
        fn new() -> Self {
            Self {
                tap: Mutex::new(None),
                runloop: Mutex::new(None),
                cancelled: AtomicBool::new(false),
            }
        }

        fn shutdown(&self) {
            self.cancelled.store(true, Ordering::SeqCst);
            if let Some(tap) = self.tap.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
                unsafe { CGEventTapEnable(*tap, false) };
            }
            if let Some(runloop) = self
                .runloop
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .as_ref()
            {
                unsafe { CFRunLoopStop(*runloop) };
            }
        }
    }

    pub struct PlatformNativeMonitor {
        handles: Arc<MacShutdownHandles>,
    }

    /// Where the tap sends what it finds.
    enum TapHandler {
        Hotkeys(NativeHotkeyHandler),
        Capture(ShortcutCaptureHandler),
    }

    impl TapHandler {
        fn dispatch(&self, output: TapOutput) {
            match self {
                Self::Hotkeys(handler) => {
                    for event in output.hotkey_events {
                        (handler.as_ref())(event);
                    }
                }
                Self::Capture(handler) => {
                    for event in output.capture_events {
                        (handler.as_ref())(event);
                    }
                }
            }
        }
    }

    impl PlatformNativeMonitor {
        pub fn start(matcher: ChordMatcher, handler: NativeHotkeyHandler) -> Result<Self, String> {
            Self::start_tap(TapLogic::Hotkeys(matcher), TapHandler::Hotkeys(handler))
        }

        pub fn start_capture(handler: ShortcutCaptureHandler) -> Result<Self, String> {
            Self::start_tap(
                TapLogic::Capture(CaptureState::default()),
                TapHandler::Capture(handler),
            )
        }

        fn start_tap(logic: TapLogic, handler: TapHandler) -> Result<Self, String> {
            let handles = Arc::new(MacShutdownHandles::new());
            let thread_handles = Arc::clone(&handles);
            let (status_tx, status_rx) = mpsc::channel();
            thread::Builder::new()
                .name("typelite-native-hotkey-mac".to_string())
                .spawn(move || run_event_tap_loop(logic, handler, thread_handles, status_tx))
                .map_err(|error| {
                    format!("Failed to spawn macOS native hotkey monitor thread: {error}")
                })?;

            match status_rx.recv_timeout(STARTUP_TIMEOUT) {
                Ok(Ok(())) => Ok(Self { handles }),
                Ok(Err(error)) => {
                    handles.shutdown();
                    Err(error)
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    handles.shutdown();
                    Err(
                        "Timed out starting macOS native hotkey EventTap after 3 seconds"
                            .to_string(),
                    )
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    handles.shutdown();
                    Err(
                        "macOS native hotkey EventTap thread exited before startup completed"
                            .to_string(),
                    )
                }
            }
        }
    }

    impl Drop for PlatformNativeMonitor {
        fn drop(&mut self) {
            self.handles.shutdown();
        }
    }

    struct CallbackContext {
        logic: Mutex<TapLogic>,
        handler: TapHandler,
        handles: Arc<MacShutdownHandles>,
    }

    fn run_event_tap_loop(
        logic: TapLogic,
        handler: TapHandler,
        handles: Arc<MacShutdownHandles>,
        status_tx: mpsc::Sender<Result<(), String>>,
    ) {
        let context = Box::into_raw(Box::new(CallbackContext {
            logic: Mutex::new(logic),
            handler,
            handles: Arc::clone(&handles),
        }));
        let mask: CgEventMask = (1u64 << FLAGS_CHANGED) | (1u64 << KEY_DOWN) | (1u64 << KEY_UP);

        unsafe {
            let tap = CGEventTapCreate(
                SESSION_EVENT_TAP,
                HEAD_INSERT,
                TAP_OPTION_DEFAULT,
                mask,
                event_tap_callback,
                context as *mut c_void,
            );
            if tap.is_null() {
                drop(Box::from_raw(context));
                let _ = status_tx.send(Err(
                    "Failed to create macOS native hotkey EventTap; Accessibility permission may be denied"
                        .to_string(),
                ));
                return;
            }
            *handles.tap.lock().unwrap_or_else(|e| e.into_inner()) = Some(tap);

            let source = CFMachPortCreateRunLoopSource(std::ptr::null(), tap, 0);
            if source.is_null() {
                CGEventTapEnable(tap, false);
                *handles.tap.lock().unwrap_or_else(|e| e.into_inner()) = None;
                CFRelease(tap as *const c_void);
                drop(Box::from_raw(context));
                let _ = status_tx.send(Err(
                    "Failed to create macOS native hotkey EventTap run loop source".to_string(),
                ));
                return;
            }

            let runloop = CFRunLoopGetCurrent();
            *handles.runloop.lock().unwrap_or_else(|e| e.into_inner()) = Some(runloop);

            if handles.cancelled.load(Ordering::SeqCst) {
                CGEventTapEnable(tap, false);
                CFRelease(source as *const c_void);
                *handles.tap.lock().unwrap_or_else(|e| e.into_inner()) = None;
                *handles.runloop.lock().unwrap_or_else(|e| e.into_inner()) = None;
                CFRelease(tap as *const c_void);
                drop(Box::from_raw(context));
                let _ = status_tx.send(Err(
                    "macOS native hotkey EventTap startup was cancelled".to_string()
                ));
                return;
            }

            CFRunLoopAddSource(runloop, source, kCFRunLoopCommonModes);
            CFRelease(source as *const c_void);
            CGEventTapEnable(tap, true);

            if status_tx.send(Ok(())).is_err() || handles.cancelled.load(Ordering::SeqCst) {
                handles.shutdown();
            }

            if !handles.cancelled.load(Ordering::SeqCst) {
                CFRunLoopRun();
            }

            if let Some(tap) = handles.tap.lock().unwrap_or_else(|e| e.into_inner()).take() {
                CGEventTapEnable(tap, false);
                CFRelease(tap as *const c_void);
            }
            *handles.runloop.lock().unwrap_or_else(|e| e.into_inner()) = None;
            drop(Box::from_raw(context));
        }
    }

    /// Called by macOS for every key event. Kept thin: read the fields, let `TapLogic`
    /// decide, send the results, and return null to swallow the event.
    extern "C" fn event_tap_callback(
        _proxy: *mut c_void,
        event_type: CgEventType,
        event: CgEventRef,
        user_info: *mut c_void,
    ) -> CgEventRef {
        if user_info.is_null() {
            return event;
        }
        let context = unsafe { &*(user_info as *const CallbackContext) };

        let kind = match event_type {
            TAP_DISABLED_BY_TIMEOUT | TAP_DISABLED_BY_USER_INPUT => {
                if let Some(tap) = context
                    .handles
                    .tap
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .as_ref()
                {
                    unsafe { CGEventTapEnable(*tap, true) };
                }
                let output = context
                    .logic
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .reset();
                context.handler.dispatch(output);
                return event;
            }
            KEY_DOWN => MacEventKind::KeyDown,
            KEY_UP => MacEventKind::KeyUp,
            FLAGS_CHANGED => MacEventKind::FlagsChanged,
            _ => return event,
        };

        let keycode = unsafe { CGEventGetIntegerValueField(event, KEYBOARD_EVENT_KEYCODE) };
        let autorepeat = kind == MacEventKind::KeyDown
            && unsafe { CGEventGetIntegerValueField(event, KEYBOARD_EVENT_AUTOREPEAT) } != 0;
        let mac_event = MacKeyEvent {
            kind,
            keycode: u16::try_from(keycode).unwrap_or(u16::MAX),
            flags: unsafe { CGEventGetFlags(event) },
            autorepeat,
        };

        // Decide under the lock, send after releasing it.
        let output = context
            .logic
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .process_mac_event(mac_event);
        let swallow = output.swallow;
        context.handler.dispatch(output);

        if swallow {
            std::ptr::null_mut()
        } else {
            event
        }
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::{ChordMatcher, KeyClass, KeyInput, NativeHotkeyHandler, ShortcutCaptureHandler};
    use std::ptr;
    use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicU32, Ordering as AtomicOrdering};
    use std::sync::{mpsc, Arc};
    use std::thread;
    use std::time::Duration;
    use windows_sys::Win32::Foundation::{GetLastError, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::System::Threading::GetCurrentThreadId;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, PeekMessageW, PostThreadMessageW,
        SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, HC_ACTION, HHOOK,
        KBDLLHOOKSTRUCT, LLKHF_INJECTED, MSG, PM_NOREMOVE, WH_KEYBOARD_LL, WM_QUIT,
    };

    const STARTUP_TIMEOUT: Duration = Duration::from_secs(3);
    const ACCEPT_SYNTHETIC_EVENTS_ENV: &str = "TYPELITE_ACCEPT_SYNTHETIC_HOTKEY_EVENTS";

    const WM_KEYDOWN: usize = 0x0100;
    const WM_KEYUP: usize = 0x0101;
    const WM_SYSKEYDOWN: usize = 0x0104;
    const WM_SYSKEYUP: usize = 0x0105;
    const VK_SPACE: u32 = 0x20;
    const VK_LSHIFT: u32 = 0xA0;
    const VK_RMENU: u32 = 0xA5;

    static HOOK_CONTEXT: AtomicPtr<CallbackContext> = AtomicPtr::new(ptr::null_mut());

    pub struct PlatformNativeMonitor {
        thread_id: u32,
        thread: Option<thread::JoinHandle<()>>,
    }

    struct WindowsStartupState {
        thread_id: AtomicU32,
        cancelled: AtomicBool,
    }

    impl WindowsStartupState {
        fn new() -> Self {
            Self {
                thread_id: AtomicU32::new(0),
                cancelled: AtomicBool::new(false),
            }
        }

        fn cancel(&self) {
            self.cancelled.store(true, AtomicOrdering::SeqCst);
            let thread_id = self.thread_id.load(AtomicOrdering::SeqCst);
            if thread_id != 0 {
                let ok = unsafe { PostThreadMessageW(thread_id, WM_QUIT, 0, 0) };
                if ok == 0 {
                    tracing::warn!(
                        "Failed to post WM_QUIT to cancelled Windows native hotkey hook thread: {}",
                        unsafe { GetLastError() }
                    );
                }
            }
        }

        fn is_cancelled(&self) -> bool {
            self.cancelled.load(AtomicOrdering::SeqCst)
        }
    }

    impl PlatformNativeMonitor {
        pub fn start(matcher: ChordMatcher, handler: NativeHotkeyHandler) -> Result<Self, String> {
            let (status_tx, status_rx) = mpsc::channel();
            let startup = Arc::new(WindowsStartupState::new());
            let thread_startup = Arc::clone(&startup);
            let thread = thread::Builder::new()
                .name("typelite-native-hotkey-win".to_string())
                .spawn(move || run_keyboard_hook_loop(matcher, handler, thread_startup, status_tx))
                .map_err(|error| {
                    format!("Failed to spawn Windows native hotkey monitor thread: {error}")
                })?;

            match status_rx.recv_timeout(STARTUP_TIMEOUT) {
                Ok(Ok(thread_id)) => Ok(Self {
                    thread_id,
                    thread: Some(thread),
                }),
                Ok(Err(error)) => {
                    startup.cancel();
                    let _ = thread.join();
                    Err(error)
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    startup.cancel();
                    let _ = thread.join();
                    Err("Timed out starting Windows native hotkey hook after 3 seconds".to_string())
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    startup.cancel();
                    let _ = thread.join();
                    Err(
                        "Windows native hotkey hook thread exited before startup completed"
                            .to_string(),
                    )
                }
            }
        }

        pub fn start_capture(_handler: ShortcutCaptureHandler) -> Result<Self, String> {
            Err(
                "Shortcut capture through the native listener is only supported on macOS"
                    .to_string(),
            )
        }
    }

    impl Drop for PlatformNativeMonitor {
        fn drop(&mut self) {
            let ok = unsafe { PostThreadMessageW(self.thread_id, WM_QUIT, 0, 0) };
            if ok == 0 {
                tracing::warn!(
                    "Failed to post WM_QUIT to Windows native hotkey hook thread: {}",
                    unsafe { GetLastError() }
                );
            }
            if let Some(thread) = self.thread.take() {
                if thread.thread().id() != thread::current().id() && thread.join().is_err() {
                    tracing::warn!("Windows native hotkey hook thread panicked during shutdown");
                }
            }
        }
    }

    struct CallbackContext {
        matcher: std::sync::Mutex<ChordMatcher>,
        handler: NativeHotkeyHandler,
        hook: std::sync::Mutex<Option<HHOOK>>,
    }

    unsafe impl Send for CallbackContext {}
    unsafe impl Sync for CallbackContext {}

    fn run_keyboard_hook_loop(
        matcher: ChordMatcher,
        handler: NativeHotkeyHandler,
        startup: Arc<WindowsStartupState>,
        status_tx: mpsc::Sender<Result<u32, String>>,
    ) {
        let thread_id = unsafe { GetCurrentThreadId() };

        unsafe {
            let mut message: MSG = std::mem::zeroed();
            let _ = PeekMessageW(&mut message, ptr::null_mut(), 0, 0, PM_NOREMOVE);
            startup.thread_id.store(thread_id, AtomicOrdering::SeqCst);

            if startup.is_cancelled() {
                let _ = status_tx.send(Err(
                    "Windows native hotkey hook startup was cancelled before install".to_string(),
                ));
                return;
            }

            let context = Box::into_raw(Box::new(CallbackContext {
                matcher: std::sync::Mutex::new(matcher),
                handler,
                hook: std::sync::Mutex::new(None),
            }));
            HOOK_CONTEXT.store(context, AtomicOrdering::SeqCst);

            // Global low-level hooks should be installed with the current module handle.
            let module = GetModuleHandleW(ptr::null());
            if module.is_null() {
                let error = GetLastError();
                let _ = HOOK_CONTEXT.compare_exchange(
                    context,
                    ptr::null_mut(),
                    AtomicOrdering::SeqCst,
                    AtomicOrdering::SeqCst,
                );
                drop(Box::from_raw(context));
                let _ = status_tx.send(Err(format!(
                    "Failed to resolve Windows module handle for native hotkey hook: Win32 error {error}"
                )));
                return;
            }

            let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(low_level_keyboard_proc), module, 0);
            if hook.is_null() {
                let _ = HOOK_CONTEXT.compare_exchange(
                    context,
                    ptr::null_mut(),
                    AtomicOrdering::SeqCst,
                    AtomicOrdering::SeqCst,
                );
                drop(Box::from_raw(context));
                let _ = status_tx.send(Err(format!(
                    "Failed to install Windows native hotkey keyboard hook: Win32 error {}",
                    GetLastError()
                )));
                return;
            }
            *(*context).hook.lock().unwrap_or_else(|e| e.into_inner()) = Some(hook);

            if startup.is_cancelled() {
                cleanup_context(context);
                let _ = status_tx.send(Err(
                    "Windows native hotkey hook startup was cancelled after install".to_string(),
                ));
                return;
            }

            if status_tx.send(Ok(thread_id)).is_err() || startup.is_cancelled() {
                cleanup_context(context);
                return;
            }

            loop {
                let result = GetMessageW(&mut message, ptr::null_mut(), 0, 0);
                if result <= 0 {
                    break;
                }
                let _ = TranslateMessage(&message);
                let _ = DispatchMessageW(&message);
            }

            cleanup_context(context);
        }
    }

    unsafe fn cleanup_context(context: *mut CallbackContext) {
        if let Some(hook) = (*context)
            .hook
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take()
        {
            if UnhookWindowsHookEx(hook) == 0 {
                tracing::warn!(
                    "Failed to unhook Windows native hotkey keyboard hook: {}",
                    GetLastError()
                );
            }
        }
        let _ = HOOK_CONTEXT.compare_exchange(
            context,
            ptr::null_mut(),
            AtomicOrdering::SeqCst,
            AtomicOrdering::SeqCst,
        );
        drop(Box::from_raw(context));
    }

    unsafe extern "system" fn low_level_keyboard_proc(
        code: i32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if code == HC_ACTION as i32 && lparam != 0 {
            let keyboard = *(lparam as *const KBDLLHOOKSTRUCT);
            let injected = (keyboard.flags & LLKHF_INJECTED) != 0;
            if (!injected || accept_synthetic_events())
                && dispatch_keyboard_event(keyboard.vkCode, wparam)
            {
                return 1;
            }
        }

        CallNextHookEx(ptr::null_mut(), code, wparam, lparam)
    }

    fn dispatch_keyboard_event(vk_code: u32, message: WPARAM) -> bool {
        let pressed = match message {
            WM_KEYDOWN | WM_SYSKEYDOWN => true,
            WM_KEYUP | WM_SYSKEYUP => false,
            _ => return false,
        };
        let class = match vk_code {
            VK_RMENU => KeyClass::Standalone,
            VK_SPACE | VK_LSHIFT => KeyClass::Typing,
            _ => return false,
        };

        let context = unsafe { callback_context() };
        let Some(context) = context else {
            return false;
        };

        let mut events = Vec::new();
        let swallow = context
            .matcher
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .handle(
                KeyInput {
                    code: vk_code as u16,
                    pressed,
                    autorepeat: false,
                    class,
                },
                &mut events,
            );
        for event in events {
            (context.handler.as_ref())(event);
        }
        swallow
    }

    unsafe fn callback_context<'a>() -> Option<&'a CallbackContext> {
        let ptr = HOOK_CONTEXT.load(AtomicOrdering::SeqCst);
        if ptr.is_null() {
            None
        } else {
            Some(&*ptr)
        }
    }

    fn accept_synthetic_events() -> bool {
        std::env::var(ACCEPT_SYNTHETIC_EVENTS_ENV).ok().as_deref() == Some("1")
    }
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
mod platform {
    use super::{ChordMatcher, NativeHotkeyHandler, ShortcutCaptureHandler};

    pub struct PlatformNativeMonitor;

    impl PlatformNativeMonitor {
        pub fn start(
            _matcher: ChordMatcher,
            _handler: NativeHotkeyHandler,
        ) -> Result<Self, String> {
            Err("Native hotkey runtime is unsupported on this platform".to_string())
        }

        pub fn start_capture(_handler: ShortcutCaptureHandler) -> Result<Self, String> {
            Err(
                "Shortcut capture through the native listener is only supported on macOS"
                    .to_string(),
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hotkey::HotkeyRole;

    const FN: u16 = 63;
    const SPACE: u16 = 49;
    const END: u16 = 119;
    const RIGHT_SHIFT: u16 = 60;
    const RIGHT_CONTROL: u16 = 62;
    const RIGHT_COMMAND: u16 = 54;
    const K: u16 = 40;
    const F13: u16 = 105;
    const ESCAPE: u16 = 53;

    fn binding(role: HotkeyRole, keys: &[u16]) -> NativeHotkeyBinding {
        NativeHotkeyBinding {
            role,
            index: 0,
            chord: NativeChord::new(keys.iter().copied()).unwrap(),
        }
    }

    fn class_of(code: u16) -> KeyClass {
        match native_keys::key_by_code(code) {
            Some(key) if key.is_modifier => KeyClass::Modifier,
            Some(key) if key.standalone => KeyClass::Standalone,
            _ => KeyClass::Typing,
        }
    }

    fn down(code: u16) -> KeyInput {
        KeyInput {
            code,
            pressed: true,
            autorepeat: false,
            class: class_of(code),
        }
    }

    fn up(code: u16) -> KeyInput {
        KeyInput {
            pressed: false,
            ..down(code)
        }
    }

    fn repeat(code: u16) -> KeyInput {
        KeyInput {
            autorepeat: true,
            ..down(code)
        }
    }

    /// Feed inputs; return (role, state) events and the swallow decision per input.
    fn run(
        matcher: &mut ChordMatcher,
        inputs: &[KeyInput],
    ) -> (Vec<(HotkeyRole, ShortcutState)>, Vec<bool>) {
        let mut events = Vec::new();
        let mut swallows = Vec::new();
        for input in inputs {
            swallows.push(matcher.handle(*input, &mut events));
        }
        (
            events
                .iter()
                .map(|event| (event.role, event.state))
                .collect(),
            swallows,
        )
    }

    /// The user's real bindings: Dictate `End`, Ask `End + Right Control`, Translate
    /// `End + Right Shift`.
    fn user_matcher() -> ChordMatcher {
        ChordMatcher::new(vec![
            binding(HotkeyRole::Dictation, &[END]),
            binding(HotkeyRole::Ask, &[END, RIGHT_CONTROL]),
            binding(HotkeyRole::TranslateSelection, &[END, RIGHT_SHIFT]),
        ])
    }

    use ShortcutState::{Pressed, Released};

    #[test]
    fn repeated_press_edges_fire_once() {
        let mut matcher = ChordMatcher::new(vec![binding(HotkeyRole::Dictation, &[F13])]);
        let (events, _) = run(
            &mut matcher,
            &[
                down(F13),
                down(F13),
                repeat(F13),
                up(F13),
                up(F13),
                down(F13),
            ],
        );
        assert_eq!(
            events,
            vec![
                (HotkeyRole::Dictation, Pressed),
                (HotkeyRole::Dictation, Released),
                (HotkeyRole::Dictation, Pressed),
            ]
        );
    }

    #[test]
    fn runtime_install_accepts_shared_handler_arc() {
        let runtime = NativeHotkeyRuntime::default();
        let handler: NativeHotkeyHandler = Arc::new(|_| {});

        assert!(runtime
            .install(Vec::new(), Arc::new(|| false), None, handler)
            .is_ok());
    }

    const LEFT_SHIFT: u16 = 56;

    /// Default bindings (Dictate `Fn`, Translate `Fn + Left Shift`) plus Switch language on
    /// either Shift, with a gate the test opens and closes.
    fn switch_matcher(translate: &[u16]) -> (ChordMatcher, Arc<std::sync::atomic::AtomicBool>) {
        let armed = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let gate_flag = Arc::clone(&armed);
        let matcher = ChordMatcher::new(vec![
            binding(HotkeyRole::Dictation, &[FN]),
            binding(HotkeyRole::TranslateSelection, translate),
            binding(HotkeyRole::SwitchLanguage, &[LEFT_SHIFT]),
            binding(HotkeyRole::SwitchLanguage, &[RIGHT_SHIFT]),
        ])
        .with_switch_gate(Arc::new(move || {
            gate_flag.load(std::sync::atomic::Ordering::SeqCst)
        }));
        (matcher, armed)
    }

    fn set(flag: &std::sync::atomic::AtomicBool, value: bool) {
        flag.store(value, std::sync::atomic::Ordering::SeqCst);
    }

    #[test]
    fn switch_language_is_ignored_and_passes_through_outside_a_translate_recording() {
        let (mut matcher, _armed) = switch_matcher(&[FN, LEFT_SHIFT]);
        let (events, swallows) = run(
            &mut matcher,
            &[
                down(RIGHT_SHIFT),
                up(RIGHT_SHIFT),
                down(LEFT_SHIFT),
                up(LEFT_SHIFT),
            ],
        );
        assert!(events.is_empty());
        assert_eq!(swallows, vec![false, false, false, false]);
    }

    #[test]
    fn switch_language_fires_and_is_swallowed_during_a_translate_recording() {
        let (mut matcher, armed) = switch_matcher(&[FN, LEFT_SHIFT]);
        set(&armed, true);
        // Right Shift is in no larger chord, so it fires on press.
        let (events, swallows) = run(&mut matcher, &[down(RIGHT_SHIFT), up(RIGHT_SHIFT)]);
        assert_eq!(
            events,
            vec![
                (HotkeyRole::SwitchLanguage, Pressed),
                (HotkeyRole::SwitchLanguage, Released),
            ]
        );
        assert_eq!(swallows, vec![true, true]);

        // Left Shift is part of Fn + Left Shift, so it fires when it goes up alone.
        let (events, swallows) = run(&mut matcher, &[down(LEFT_SHIFT), up(LEFT_SHIFT)]);
        assert_eq!(
            events,
            vec![
                (HotkeyRole::SwitchLanguage, Pressed),
                (HotkeyRole::SwitchLanguage, Released),
            ]
        );
        assert_eq!(swallows, vec![true, true]);
    }

    #[test]
    fn switch_key_held_from_the_translate_chord_does_not_count() {
        let (mut matcher, armed) = switch_matcher(&[FN, LEFT_SHIFT]);
        let (events, _) = run(&mut matcher, &[down(FN), down(LEFT_SHIFT)]);
        assert_eq!(events, vec![(HotkeyRole::TranslateSelection, Pressed)]);

        // The recording starts while the chord is still held.
        set(&armed, true);
        let (events, swallows) = run(&mut matcher, &[up(LEFT_SHIFT), up(FN)]);
        assert_eq!(events, vec![(HotkeyRole::TranslateSelection, Released)]);
        assert_eq!(
            swallows,
            vec![false, false],
            "the chord's release reaches the app"
        );

        // A fresh press counts.
        let (events, _) = run(&mut matcher, &[down(LEFT_SHIFT), up(LEFT_SHIFT)]);
        assert_eq!(
            events,
            vec![
                (HotkeyRole::SwitchLanguage, Pressed),
                (HotkeyRole::SwitchLanguage, Released),
            ]
        );
    }

    #[test]
    fn translate_chord_again_finishes_instead_of_switching() {
        let (mut matcher, armed) = switch_matcher(&[FN, LEFT_SHIFT]);
        set(&armed, true);
        // Shift first, then Fn: the larger Translate chord wins over the waiting switch.
        let (events, swallows) = run(
            &mut matcher,
            &[down(LEFT_SHIFT), down(FN), up(FN), up(LEFT_SHIFT)],
        );
        assert_eq!(
            events,
            vec![
                (HotkeyRole::TranslateSelection, Pressed),
                (HotkeyRole::TranslateSelection, Released),
            ]
        );
        // Shift went down swallowed, so its release is swallowed too.
        assert_eq!(swallows, vec![true, false, false, true]);
    }

    #[test]
    fn hold_mode_switches_with_the_other_shift_while_the_chord_is_held() {
        let (mut matcher, armed) = switch_matcher(&[END, RIGHT_SHIFT]);
        let (events, _) = run(&mut matcher, &[down(END), down(RIGHT_SHIFT)]);
        assert_eq!(events, vec![(HotkeyRole::TranslateSelection, Pressed)]);
        set(&armed, true);
        let (events, _) = run(&mut matcher, &[down(LEFT_SHIFT), up(LEFT_SHIFT)]);
        assert_eq!(
            events,
            vec![
                (HotkeyRole::SwitchLanguage, Pressed),
                (HotkeyRole::SwitchLanguage, Released),
            ]
        );
        let (events, _) = run(&mut matcher, &[up(END)]);
        assert_eq!(events, vec![(HotkeyRole::TranslateSelection, Released)]);
    }

    #[test]
    fn dictate_key_still_fires_during_a_translate_recording() {
        let (mut matcher, armed) = switch_matcher(&[FN, LEFT_SHIFT]);
        set(&armed, true);
        let (events, _) = run(&mut matcher, &[down(FN), up(FN)]);
        assert_eq!(
            events,
            vec![
                (HotkeyRole::Dictation, Pressed),
                (HotkeyRole::Dictation, Released),
            ]
        );
    }

    #[test]
    fn combo_suppresses_bare_base_when_combo_is_used() {
        let mut matcher = ChordMatcher::new(vec![
            binding(HotkeyRole::Dictation, &[FN]),
            binding(HotkeyRole::Ask, &[FN, SPACE]),
        ]);
        let (events, _) = run(&mut matcher, &[down(FN)]);
        assert!(events.is_empty(), "bare Fn must wait for its release");

        let (events, _) = run(&mut matcher, &[down(SPACE), up(SPACE), up(FN)]);
        assert_eq!(
            events,
            vec![(HotkeyRole::Ask, Pressed), (HotkeyRole::Ask, Released)]
        );
    }

    #[test]
    fn releasing_end_first_releases_right_control_combo() {
        let mut matcher = ChordMatcher::new(vec![
            binding(HotkeyRole::Dictation, &[END]),
            binding(HotkeyRole::TranslateSelection, &[END, RIGHT_CONTROL]),
        ]);
        let (events, _) = run(&mut matcher, &[down(END), down(RIGHT_CONTROL), up(END)]);
        assert_eq!(
            events,
            vec![
                (HotkeyRole::TranslateSelection, Pressed),
                (HotkeyRole::TranslateSelection, Released),
            ]
        );
        let (events, _) = run(&mut matcher, &[up(RIGHT_CONTROL)]);
        assert!(events.is_empty());
    }

    #[test]
    fn combo_dispatches_bare_base_when_no_combo_is_used() {
        let mut matcher = ChordMatcher::new(vec![
            binding(HotkeyRole::Dictation, &[FN]),
            binding(HotkeyRole::Ask, &[FN, SPACE]),
        ]);
        let (events, _) = run(&mut matcher, &[down(FN)]);
        assert!(events.is_empty());
        let (events, _) = run(&mut matcher, &[up(FN)]);
        assert_eq!(
            events,
            vec![
                (HotkeyRole::Dictation, Pressed),
                (HotkeyRole::Dictation, Released),
            ]
        );
    }

    #[test]
    fn user_bindings_bare_end_fires_on_release_and_is_swallowed() {
        let mut matcher = user_matcher();
        let (events, swallows) = run(&mut matcher, &[down(END), repeat(END), up(END)]);
        assert_eq!(
            events,
            vec![
                (HotkeyRole::Dictation, Pressed),
                (HotkeyRole::Dictation, Released),
            ]
        );
        assert_eq!(swallows, vec![true, true, true]);
    }

    #[test]
    fn user_bindings_end_then_right_control_is_ask_only() {
        let mut matcher = user_matcher();
        let (events, swallows) = run(
            &mut matcher,
            &[down(END), down(RIGHT_CONTROL), up(RIGHT_CONTROL), up(END)],
        );
        assert_eq!(
            events,
            vec![(HotkeyRole::Ask, Pressed), (HotkeyRole::Ask, Released)]
        );
        // End swallowed both ways; the modifier always passes through.
        assert_eq!(swallows, vec![true, false, false, true]);
    }

    #[test]
    fn user_bindings_accept_modifier_first_order() {
        let mut matcher = user_matcher();
        let (events, _) = run(
            &mut matcher,
            &[down(RIGHT_SHIFT), down(END), up(END), up(RIGHT_SHIFT)],
        );
        assert_eq!(
            events,
            vec![
                (HotkeyRole::TranslateSelection, Pressed),
                (HotkeyRole::TranslateSelection, Released),
            ]
        );
    }

    #[test]
    fn bare_key_without_combos_fires_on_press() {
        let mut matcher = ChordMatcher::new(vec![
            binding(HotkeyRole::Dictation, &[END]),
            binding(HotkeyRole::Ask, &[F13]),
        ]);
        let (events, _) = run(&mut matcher, &[down(F13)]);
        assert_eq!(events, vec![(HotkeyRole::Ask, Pressed)]);
    }

    #[test]
    fn three_key_chord_suppresses_its_sub_chords() {
        let mut matcher = ChordMatcher::new(vec![
            binding(HotkeyRole::Dictation, &[END]),
            binding(HotkeyRole::TranslateSelection, &[END, RIGHT_SHIFT]),
            binding(HotkeyRole::Ask, &[END, RIGHT_SHIFT, RIGHT_CONTROL]),
        ]);
        let (events, _) = run(
            &mut matcher,
            &[
                down(END),
                down(RIGHT_SHIFT),
                down(RIGHT_CONTROL),
                up(RIGHT_CONTROL),
                up(RIGHT_SHIFT),
                up(END),
            ],
        );
        assert_eq!(
            events,
            vec![(HotkeyRole::Ask, Pressed), (HotkeyRole::Ask, Released)]
        );
    }

    #[test]
    fn deferred_two_key_chord_fires_when_released_before_third_key() {
        let mut matcher = ChordMatcher::new(vec![
            binding(HotkeyRole::Dictation, &[END]),
            binding(HotkeyRole::TranslateSelection, &[END, RIGHT_SHIFT]),
            binding(HotkeyRole::Ask, &[END, RIGHT_SHIFT, RIGHT_CONTROL]),
        ]);
        let (events, _) = run(
            &mut matcher,
            &[down(END), down(RIGHT_SHIFT), up(RIGHT_SHIFT), up(END)],
        );
        assert_eq!(
            events,
            vec![
                (HotkeyRole::TranslateSelection, Pressed),
                (HotkeyRole::TranslateSelection, Released),
            ]
        );
    }

    #[test]
    fn typing_key_is_swallowed_only_when_it_completes_a_chord() {
        let mut matcher = ChordMatcher::new(vec![binding(HotkeyRole::Ask, &[RIGHT_COMMAND, K])]);
        let (events, swallows) = run(&mut matcher, &[down(K), up(K)]);
        assert!(events.is_empty());
        assert_eq!(swallows, vec![false, false], "plain K must still type");

        let (events, swallows) = run(
            &mut matcher,
            &[
                down(RIGHT_COMMAND),
                down(K),
                repeat(K),
                up(K),
                up(RIGHT_COMMAND),
            ],
        );
        assert_eq!(
            events,
            vec![(HotkeyRole::Ask, Pressed), (HotkeyRole::Ask, Released)]
        );
        assert_eq!(swallows, vec![false, true, true, true, false]);
    }

    #[test]
    fn reset_releases_active_chords() {
        let mut matcher = ChordMatcher::new(vec![binding(HotkeyRole::Dictation, &[F13])]);
        let (events, _) = run(&mut matcher, &[down(F13)]);
        assert_eq!(events, vec![(HotkeyRole::Dictation, Pressed)]);
        let mut events = Vec::new();
        matcher.reset(&mut events);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].state, Released);
        assert!(matcher.held_codes().is_empty());
    }

    fn mac(kind: MacEventKind, keycode: u16, flags: u64) -> MacKeyEvent {
        MacKeyEvent {
            kind,
            keycode,
            flags,
            autorepeat: false,
        }
    }

    #[test]
    fn mac_flags_changed_uses_device_bits_for_side() {
        let right_shift_down = mac(
            MacEventKind::FlagsChanged,
            RIGHT_SHIFT,
            0x0002_0000 | native_keys::FLAG_DEVICE_RIGHT_SHIFT,
        );
        assert_eq!(
            mac_key_input(right_shift_down).map(|input| input.pressed),
            Some(true)
        );
        // Left Shift still held (generic Shift bit set) but Right Shift went up.
        let right_shift_up = mac(
            MacEventKind::FlagsChanged,
            RIGHT_SHIFT,
            0x0002_0000 | native_keys::FLAG_DEVICE_LEFT_SHIFT,
        );
        assert_eq!(
            mac_key_input(right_shift_up).map(|input| input.pressed),
            Some(false)
        );
        // CapsLock (57) is ignored.
        assert_eq!(mac_key_input(mac(MacEventKind::FlagsChanged, 57, 0)), None);
    }

    #[test]
    fn mac_events_drive_the_users_bindings() {
        let mut logic = TapLogic::Hotkeys(user_matcher());
        let rc = native_keys::FLAG_DEVICE_RIGHT_CONTROL;
        let end_down = logic.process_mac_event(mac(MacEventKind::KeyDown, END, 0));
        assert!(end_down.swallow);
        assert!(end_down.hotkey_events.is_empty());

        let rc_down = logic.process_mac_event(mac(MacEventKind::FlagsChanged, RIGHT_CONTROL, rc));
        assert!(!rc_down.swallow);
        assert_eq!(rc_down.hotkey_events.len(), 1);
        assert_eq!(rc_down.hotkey_events[0].role, HotkeyRole::Ask);

        let end_up = logic.process_mac_event(mac(MacEventKind::KeyUp, END, rc));
        assert!(end_up.swallow);
        assert_eq!(end_up.hotkey_events[0].state, Released);
    }

    #[test]
    fn mac_key_event_picks_up_modifier_held_before_the_tap_started() {
        let mut logic = TapLogic::Hotkeys(user_matcher());
        let output = logic.process_mac_event(mac(
            MacEventKind::KeyDown,
            END,
            native_keys::FLAG_DEVICE_RIGHT_SHIFT,
        ));
        assert_eq!(output.hotkey_events.len(), 1);
        assert_eq!(output.hotkey_events[0].role, HotkeyRole::TranslateSelection);
    }

    #[test]
    fn mac_flags_changed_drops_a_modifier_whose_release_was_missed() {
        let mut logic = TapLogic::Hotkeys(user_matcher());
        let rs = native_keys::FLAG_DEVICE_RIGHT_SHIFT;
        let rc = native_keys::FLAG_DEVICE_RIGHT_CONTROL;
        logic.process_mac_event(mac(MacEventKind::FlagsChanged, RIGHT_SHIFT, rs));
        // The Right Shift release is lost; the next flagsChanged (Right Control down) shows
        // Right Shift is up.
        logic.process_mac_event(mac(MacEventKind::FlagsChanged, RIGHT_CONTROL, rc));
        let output = logic.process_mac_event(mac(MacEventKind::KeyDown, END, rc));
        assert_eq!(output.hotkey_events.len(), 1);
        assert_eq!(output.hotkey_events[0].role, HotkeyRole::Ask);
    }

    fn capture_run(inputs: &[KeyInput]) -> Vec<ShortcutCaptureEvent> {
        let mut capture = CaptureState::default();
        inputs
            .iter()
            .filter_map(|input| capture.handle(*input).0)
            .collect()
    }

    fn progress(held: &[&str]) -> ShortcutCaptureEvent {
        ShortcutCaptureEvent {
            held: held.iter().map(|name| name.to_string()).collect(),
            finished: false,
            cancelled: false,
        }
    }

    #[test]
    fn capture_reports_live_keys_and_finishes_with_the_largest_set() {
        let events = capture_run(&[
            down(END),
            repeat(END),
            down(RIGHT_SHIFT),
            up(RIGHT_SHIFT),
            up(END),
        ]);
        assert_eq!(
            events,
            vec![
                progress(&["End"]),
                progress(&["End", "RightShift"]),
                progress(&["End"]),
                ShortcutCaptureEvent {
                    held: vec!["End".to_string(), "RightShift".to_string()],
                    finished: true,
                    cancelled: false,
                },
            ]
        );
    }

    #[test]
    fn capture_keeps_press_order_and_the_latest_largest_set() {
        let events = capture_run(&[
            down(RIGHT_SHIFT),
            down(END),
            up(END),
            down(F13),
            up(F13),
            up(RIGHT_SHIFT),
        ]);
        let last = events.last().unwrap();
        assert!(last.finished);
        assert_eq!(last.held, vec!["RightShift", "F13"]);
    }

    #[test]
    fn capture_escape_cancels_and_later_keys_are_ignored() {
        let mut capture = CaptureState::default();
        let (_, _) = capture.handle(down(END));
        let (event, swallow) = capture.handle(down(ESCAPE));
        assert!(swallow);
        assert_eq!(
            event,
            Some(ShortcutCaptureEvent {
                held: vec!["End".to_string()],
                finished: false,
                cancelled: true,
            })
        );
        assert_eq!(capture.handle(up(END)).0, None);
    }

    #[test]
    fn capture_limits_chords_to_three_keys_and_ignores_foreign_releases() {
        let events = capture_run(&[
            up(K), // held before capture started
            down(END),
            down(RIGHT_SHIFT),
            down(RIGHT_CONTROL),
            down(F13),
            up(F13),
            up(RIGHT_CONTROL),
            up(RIGHT_SHIFT),
            up(END),
        ]);
        let last = events.last().unwrap();
        assert!(last.finished);
        assert_eq!(last.held, vec!["End", "RightShift", "RightControl"]);
        assert!(events
            .iter()
            .all(|event| event.held.len() <= MAX_CHORD_KEYS));
    }

    #[test]
    fn capture_swallows_keys_but_not_modifiers() {
        let mut logic = TapLogic::Capture(CaptureState::default());
        let key = logic.process_mac_event(mac(MacEventKind::KeyDown, K, 0));
        assert!(key.swallow);
        assert_eq!(key.capture_events, vec![progress(&["K"])]);
        let modifier = logic.process_mac_event(mac(
            MacEventKind::FlagsChanged,
            RIGHT_COMMAND,
            native_keys::FLAG_DEVICE_RIGHT_COMMAND,
        ));
        assert!(!modifier.swallow);
        assert_eq!(
            modifier.capture_events,
            vec![progress(&["K", "RightCommand"])]
        );
        // Unknown keycodes are swallowed too but not reported.
        let unknown = logic.process_mac_event(mac(MacEventKind::KeyDown, 200, 0));
        assert!(unknown.swallow);
        assert!(unknown.capture_events.is_empty());
    }

    /// The user's bindings plus Escape as the cancel key, with a run gate the test controls.
    fn cancel_matcher() -> (ChordMatcher, Arc<std::sync::atomic::AtomicBool>) {
        let active = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let gate_flag = Arc::clone(&active);
        let matcher = user_matcher().with_cancel_key(
            ESCAPE,
            Arc::new(move || gate_flag.load(std::sync::atomic::Ordering::SeqCst)),
        );
        (matcher, active)
    }

    #[test]
    fn escape_passes_through_when_no_run_is_active() {
        let (mut matcher, _active) = cancel_matcher();
        let (events, swallows) = run(&mut matcher, &[down(ESCAPE), repeat(ESCAPE), up(ESCAPE)]);
        assert!(events.is_empty());
        assert_eq!(swallows, vec![false, false, false]);
    }

    #[test]
    fn escape_cancels_and_is_swallowed_during_a_run() {
        let (mut matcher, active) = cancel_matcher();
        set(&active, true);
        let (events, swallows) = run(
            &mut matcher,
            &[down(ESCAPE), repeat(ESCAPE), repeat(ESCAPE), up(ESCAPE)],
        );
        assert_eq!(
            events,
            vec![(HotkeyRole::Cancel, Pressed)],
            "repeats do not re-fire"
        );
        assert_eq!(swallows, vec![true, true, true, true]);
    }

    #[test]
    fn escape_release_after_the_run_ended_is_still_swallowed() {
        let (mut matcher, active) = cancel_matcher();
        set(&active, true);
        let (_, swallows) = run(&mut matcher, &[down(ESCAPE)]);
        assert_eq!(swallows, vec![true]);
        // The cancel ends the run before the key goes up.
        set(&active, false);
        let (events, swallows) = run(&mut matcher, &[repeat(ESCAPE), up(ESCAPE)]);
        assert!(events.is_empty());
        assert_eq!(
            swallows,
            vec![true, true],
            "the app never sees half of the key"
        );
        // The next press is untouched again.
        let (_, swallows) = run(&mut matcher, &[down(ESCAPE), up(ESCAPE)]);
        assert_eq!(swallows, vec![false, false]);
    }

    #[test]
    fn escape_held_before_the_run_does_not_cancel_on_autorepeat() {
        let (mut matcher, active) = cancel_matcher();
        let (_, swallows) = run(&mut matcher, &[down(ESCAPE)]);
        assert_eq!(swallows, vec![false]);
        set(&active, true);
        let (events, swallows) = run(&mut matcher, &[repeat(ESCAPE), up(ESCAPE)]);
        assert!(events.is_empty());
        assert_eq!(swallows, vec![false, false]);
    }

    #[test]
    fn escape_cancel_does_not_disturb_the_shortcuts() {
        let (mut matcher, active) = cancel_matcher();
        let (events, _) = run(&mut matcher, &[down(END), up(END)]);
        assert_eq!(
            events,
            vec![
                (HotkeyRole::Dictation, Pressed),
                (HotkeyRole::Dictation, Released)
            ]
        );
        set(&active, true);
        // Bare End waits for its release (End + Right Shift is also bound).
        let (events, swallows) = run(
            &mut matcher,
            &[down(ESCAPE), up(ESCAPE), down(END), up(END)],
        );
        assert_eq!(
            events,
            vec![
                (HotkeyRole::Cancel, Pressed),
                (HotkeyRole::Dictation, Pressed),
                (HotkeyRole::Dictation, Released)
            ]
        );
        assert_eq!(swallows, vec![true, true, true, true]);
    }

    #[test]
    fn mac_escape_is_swallowed_only_during_a_run_and_capture_keeps_its_meaning() {
        let (matcher, active) = cancel_matcher();
        let mut logic = TapLogic::Hotkeys(matcher);
        let idle = logic.process_mac_event(mac(MacEventKind::KeyDown, ESCAPE, 0));
        assert!(!idle.swallow);
        assert!(idle.hotkey_events.is_empty());
        assert!(
            !logic
                .process_mac_event(mac(MacEventKind::KeyUp, ESCAPE, 0))
                .swallow
        );

        set(&active, true);
        let running = logic.process_mac_event(mac(MacEventKind::KeyDown, ESCAPE, 0));
        assert!(running.swallow);
        assert_eq!(running.hotkey_events.len(), 1);
        assert_eq!(running.hotkey_events[0].role, HotkeyRole::Cancel);
        assert!(
            logic
                .process_mac_event(mac(MacEventKind::KeyUp, ESCAPE, 0))
                .swallow
        );

        // Shortcut capture has no cancel key: Escape still cancels the capture.
        let mut capture = TapLogic::Capture(CaptureState::default());
        let output = capture.process_mac_event(mac(MacEventKind::KeyDown, ESCAPE, 0));
        assert!(output.swallow);
        assert!(output.hotkey_events.is_empty());
        assert_eq!(output.capture_events.len(), 1);
        assert!(output.capture_events[0].cancelled);
    }
}
