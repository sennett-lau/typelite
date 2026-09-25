use crate::commands;
use crate::native_hotkey::NativeChord;
use crate::native_keys;
use crate::pipeline;
use crate::storage;
use crate::AskHotkeyCache;
use crate::HotkeyModeCache;
use crate::HotkeyRoleCache;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

pub const HOTKEY_SUPERVISOR_RETRY_DELAY_SECS: u64 = 3;
pub const HOTKEY_SUPERVISOR_FAST_RETRY_LIMIT: u8 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HotkeySupervisorState {
    Starting,
    Installed,
    Failed,
    Disabled,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HotkeySupervisorSnapshot {
    pub generation: u64,
    pub state: HotkeySupervisorState,
    pub retry_attempts: u8,
    pub last_error: Option<String>,
}

#[derive(Debug)]
struct HotkeySupervisorInner {
    generation: u64,
    state: HotkeySupervisorState,
    retry_attempts: u8,
    last_error: Option<String>,
}

#[derive(Clone, Debug)]
pub struct HotkeySupervisor(Arc<Mutex<HotkeySupervisorInner>>);

impl Default for HotkeySupervisor {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(HotkeySupervisorInner {
            generation: 1,
            state: HotkeySupervisorState::Starting,
            retry_attempts: 0,
            last_error: None,
        })))
    }
}

impl HotkeySupervisor {
    pub fn snapshot(&self) -> HotkeySupervisorSnapshot {
        let guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        HotkeySupervisorSnapshot {
            generation: guard.generation,
            state: guard.state,
            retry_attempts: guard.retry_attempts,
            last_error: guard.last_error.clone(),
        }
    }

    pub fn begin_registration_attempt(&self) -> u64 {
        let mut guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        guard.state = HotkeySupervisorState::Starting;
        guard.generation
    }

    pub fn begin_retry_registration_attempt(&self) -> Option<u64> {
        let mut guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if guard.state != HotkeySupervisorState::Failed
            || guard.retry_attempts > HOTKEY_SUPERVISOR_FAST_RETRY_LIMIT
        {
            return None;
        }
        guard.state = HotkeySupervisorState::Starting;
        Some(guard.generation)
    }

    pub fn wake_for_settings_change(&self) -> u64 {
        let mut guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        guard.generation = guard.generation.saturating_add(1);
        guard.state = HotkeySupervisorState::Starting;
        guard.retry_attempts = 0;
        guard.last_error = None;
        guard.generation
    }

    pub fn is_current_generation(&self, generation: u64) -> bool {
        let guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        guard.generation == generation
    }

    pub fn run_if_current_generation<R>(
        &self,
        generation: u64,
        f: impl FnOnce() -> R,
    ) -> Option<R> {
        let guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if guard.generation != generation {
            return None;
        }
        Some(f())
    }

    pub fn record_registration_success(&self, generation: u64) {
        let mut guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if guard.generation != generation {
            return;
        }
        guard.state = HotkeySupervisorState::Installed;
        guard.retry_attempts = 0;
        guard.last_error = None;
    }

    pub fn record_registration_failure(&self, generation: u64, message: String) {
        let mut guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if guard.generation != generation {
            return;
        }
        guard.state = HotkeySupervisorState::Failed;
        guard.retry_attempts = guard.retry_attempts.saturating_add(1);
        guard.last_error = Some(message);
    }

    pub fn record_disabled(&self, generation: u64) {
        let mut guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if guard.generation != generation {
            return;
        }
        guard.state = HotkeySupervisorState::Disabled;
        guard.last_error = None;
    }

    pub fn disable(&self) -> u64 {
        let mut guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        guard.generation = guard.generation.saturating_add(1);
        guard.state = HotkeySupervisorState::Disabled;
        guard.retry_attempts = 0;
        guard.last_error = None;
        guard.generation
    }

    pub fn next_retry_delay(&self) -> Option<Duration> {
        let guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if guard.state == HotkeySupervisorState::Failed
            && guard.retry_attempts <= HOTKEY_SUPERVISOR_FAST_RETRY_LIMIT
        {
            Some(Duration::from_secs(HOTKEY_SUPERVISOR_RETRY_DELAY_SECS))
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HotkeyPairError {
    InvalidDictationHotkey(String),
    InvalidAskHotkey(String),
    InvalidRoleHotkey {
        role: &'static str,
        value: String,
    },
    InvalidIndexedHotkey {
        role: HotkeyRole,
        index: usize,
        value: String,
    },
    UnsupportedNativeHotkey {
        role: HotkeyRole,
        index: usize,
        value: String,
        platform: String,
    },
    ConflictingHotkeys,
    ConflictingRoleHotkeys {
        role: HotkeyRole,
        index: usize,
        conflict_role: HotkeyRole,
        conflict_index: usize,
    },
}

impl std::fmt::Display for HotkeyPairError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidDictationHotkey(value) => write!(f, "Invalid hotkey: {value}"),
            Self::InvalidAskHotkey(value) => write!(f, "Invalid Ask hotkey: {value}"),
            Self::InvalidRoleHotkey { role, value } => {
                write!(f, "Invalid {role} hotkey: {value}")
            }
            Self::InvalidIndexedHotkey { role, index, value } => {
                write!(
                    f,
                    "Invalid {} hotkey at index {index}: {value}",
                    role.as_str()
                )
            }
            Self::UnsupportedNativeHotkey {
                role,
                index,
                value,
                platform,
            } => write!(
                f,
                "Unsupported {} hotkey at index {index} on {platform}: {value}",
                role.as_str()
            ),
            Self::ConflictingHotkeys => {
                write!(f, "Dictation and Ask hotkeys must use different shortcuts")
            }
            Self::ConflictingRoleHotkeys {
                role,
                index,
                conflict_role,
                conflict_index,
            } => write!(
                f,
                "{} hotkey at index {index} conflicts with {} hotkey at index {conflict_index}",
                role.as_str(),
                conflict_role.as_str()
            ),
        }
    }
}

impl HotkeyPairError {
    pub fn is_conflict(&self) -> bool {
        matches!(
            self,
            Self::ConflictingHotkeys | Self::ConflictingRoleHotkeys { .. }
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HotkeyRole {
    Dictation,
    Ask,
    TranslateSelection,
    EditSelection,
    SwitchScene,
    OpenApp,
    /// Moves a running Translate recording to its next language. Only active while a
    /// Translate recording runs (see `native_hotkey::ChordMatcher`).
    SwitchLanguage,
    /// Escape while a run is active: cancels it like the pill's cancel button. Not a
    /// configurable shortcut; the native key listener fires it (see
    /// `native_hotkey::ChordMatcher::with_cancel_key`).
    Cancel,
}

impl HotkeyRole {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Dictation => "dictation",
            Self::Ask => "ask",
            Self::TranslateSelection => "translate",
            Self::EditSelection => "editSelection",
            Self::SwitchScene => "switchScene",
            Self::OpenApp => "openApp",
            Self::SwitchLanguage => "switchLanguage",
            Self::Cancel => "cancel",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegisteredGlobalHotkey {
    pub role: HotkeyRole,
    pub index: usize,
    pub shortcut: Shortcut,
}

pub type RegisteredHotkey = RegisteredGlobalHotkey;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegisteredNativeHotkey {
    pub role: HotkeyRole,
    pub index: usize,
    pub chord: NativeChord,
    /// The binding as text (`End+RightShift`), for logs and error messages.
    pub display: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct HotkeyRegistrationPlan {
    pub global: Vec<RegisteredGlobalHotkey>,
    pub native: Vec<RegisteredNativeHotkey>,
}

fn push_optional_registered_hotkey(
    plan: &mut HotkeyRegistrationPlan,
    role: HotkeyRole,
    binding: Option<&storage::ShortcutBinding>,
    platform: &str,
) -> Result<(), HotkeyPairError> {
    let Some(binding) = binding else {
        return Ok(());
    };
    push_registered_hotkey(plan, role, 0, binding, platform)
}

fn binding_display(binding: &storage::ShortcutBinding) -> String {
    binding
        .to_hotkey_string()
        .unwrap_or_else(|| binding.primary.clone())
}

fn invalid_binding_error(
    role: HotkeyRole,
    index: usize,
    binding: &storage::ShortcutBinding,
) -> HotkeyPairError {
    if index > 0 {
        return HotkeyPairError::InvalidIndexedHotkey {
            role,
            index,
            value: binding_display(binding),
        };
    }
    match role {
        HotkeyRole::Dictation => HotkeyPairError::InvalidDictationHotkey(binding_display(binding)),
        HotkeyRole::Ask => HotkeyPairError::InvalidAskHotkey(binding_display(binding)),
        role => HotkeyPairError::InvalidRoleHotkey {
            role: role.as_str(),
            value: binding_display(binding),
        },
    }
}

/// Native bindings conflict when they use the same set of keys, whatever the order.
fn native_conflict<'a>(
    plan: &'a HotkeyRegistrationPlan,
    chord: &NativeChord,
) -> Option<&'a RegisteredNativeHotkey> {
    plan.native
        .iter()
        .find(|registered| &registered.chord == chord)
}

fn global_conflict<'a>(
    plan: &'a HotkeyRegistrationPlan,
    shortcut: &Shortcut,
) -> Option<&'a RegisteredGlobalHotkey> {
    plan.global
        .iter()
        .find(|registered| shortcuts_match(&registered.shortcut, shortcut))
}

fn conflict_error(
    role: HotkeyRole,
    index: usize,
    conflict_role: HotkeyRole,
    conflict_index: usize,
) -> HotkeyPairError {
    if index == 0
        && conflict_index == 0
        && matches!(
            (role, conflict_role),
            (HotkeyRole::Ask, HotkeyRole::Dictation) | (HotkeyRole::Dictation, HotkeyRole::Ask)
        )
    {
        HotkeyPairError::ConflictingHotkeys
    } else {
        HotkeyPairError::ConflictingRoleHotkeys {
            role,
            index,
            conflict_role,
            conflict_index,
        }
    }
}

fn push_registered_hotkey(
    plan: &mut HotkeyRegistrationPlan,
    role: HotkeyRole,
    index: usize,
    binding: &storage::ShortcutBinding,
    platform: &str,
) -> Result<(), HotkeyPairError> {
    if let Some(chord) = native_chord_from_binding(binding, platform) {
        if let Some(conflict) = native_conflict(plan, &chord) {
            return Err(conflict_error(role, index, conflict.role, conflict.index));
        }
        plan.native.push(RegisteredNativeHotkey {
            role,
            index,
            chord,
            display: binding_display(binding),
        });
        return Ok(());
    }

    let Some(shortcut) = shortcut_from_binding(binding) else {
        if is_native_binding_elsewhere(binding) {
            return Err(HotkeyPairError::UnsupportedNativeHotkey {
                role,
                index,
                value: binding_display(binding),
                platform: platform.to_string(),
            });
        }
        return Err(invalid_binding_error(role, index, binding));
    };
    if let Some(conflict) = global_conflict(plan, &shortcut) {
        return Err(conflict_error(role, index, conflict.role, conflict.index));
    }
    plan.global.push(RegisteredGlobalHotkey {
        role,
        index,
        shortcut,
    });
    Ok(())
}

/// True when the binding would be a native binding on some platform, so an error on this
/// platform should say "unsupported here" rather than "invalid".
fn is_native_binding_elsewhere(binding: &storage::ShortcutBinding) -> bool {
    ["macos", "windows"]
        .iter()
        .any(|platform| native_chord_from_binding(binding, platform).is_some())
}

/// All key names of a binding (modifiers first, then the primary), normalised.
fn binding_key_names(binding: &storage::ShortcutBinding) -> Option<Vec<String>> {
    let mut binding = binding.clone();
    if !binding.normalize() {
        return None;
    }
    let mut names = binding.modifiers;
    names.push(binding.primary);
    Some(names)
}

/// Decide whether a binding must go through the native listener, and if so which keys it
/// watches.
///
/// macOS: native when every key is in the `native_keys` table and at least one key is
/// native-only (Fn, End, Home, PageUp/PageDown, F13–F20, a side-specific modifier) or all keys
/// are modifiers. Bindings with generic modifiers (`Ctrl`, `Shift`, `Option`, `Command`) are
/// left to `tauri-plugin-global-shortcut`, which handles "either side" modifiers itself.
///
/// Windows (minimal): chords of Right Alt with Space and Left Shift.
///
/// Returns `None` when the binding should use the global-shortcut plugin instead.
pub fn native_chord_from_binding(
    binding: &storage::ShortcutBinding,
    platform: &str,
) -> Option<NativeChord> {
    let names = binding_key_names(binding)?;
    match platform {
        "macos" => macos_native_chord(&names),
        "windows" => windows_native_chord(&names),
        _ => None,
    }
}

fn macos_native_chord(names: &[String]) -> Option<NativeChord> {
    let mut codes = Vec::with_capacity(names.len());
    let mut any_native_only = false;
    let mut all_modifiers = true;
    for name in names {
        let key = native_keys::key_by_name(name)?;
        any_native_only |= native_keys::is_native_only(key);
        all_modifiers &= key.is_modifier;
        codes.push(key.code);
    }
    if any_native_only || all_modifiers {
        NativeChord::new(codes)
    } else {
        None
    }
}

fn windows_native_chord(names: &[String]) -> Option<NativeChord> {
    // Windows virtual-key codes: VK_RMENU (Right Alt), VK_SPACE, VK_LSHIFT.
    const VK_RMENU: u16 = 0xA5;
    let mut codes = Vec::with_capacity(names.len());
    for name in names {
        codes.push(match name.as_str() {
            "RightAlt" => VK_RMENU,
            "Space" => 0x20,
            "LeftShift" => 0xA0,
            _ => return None,
        });
    }
    if codes.contains(&VK_RMENU) {
        NativeChord::new(codes)
    } else {
        None
    }
}

pub fn hotkey_registration_plan_from_config(
    config: &storage::HotkeyConfig,
) -> Result<HotkeyRegistrationPlan, HotkeyPairError> {
    hotkey_registration_plan_from_config_for_platform(config, std::env::consts::OS)
}

pub(crate) fn hotkey_registration_plan_from_config_for_platform(
    config: &storage::HotkeyConfig,
    platform: &str,
) -> Result<HotkeyRegistrationPlan, HotkeyPairError> {
    let mut plan = HotkeyRegistrationPlan::default();

    let dictation_bindings = if config.dictation_bindings.is_empty() {
        std::slice::from_ref(&config.dictation)
    } else {
        config.dictation_bindings.as_slice()
    };
    let ask_bindings = if config.ask_bindings.is_empty() {
        config.ask.as_slice()
    } else {
        config.ask_bindings.as_slice()
    };
    let translate_bindings = if config.translate_bindings.is_empty() {
        config.translate.as_slice()
    } else {
        config.translate_bindings.as_slice()
    };

    for (index, binding) in dictation_bindings.iter().enumerate() {
        push_registered_hotkey(&mut plan, HotkeyRole::Dictation, index, binding, platform)?;
    }
    for (index, binding) in ask_bindings.iter().enumerate() {
        push_registered_hotkey(&mut plan, HotkeyRole::Ask, index, binding, platform)?;
    }
    for (index, binding) in translate_bindings.iter().enumerate() {
        push_registered_hotkey(
            &mut plan,
            HotkeyRole::TranslateSelection,
            index,
            binding,
            platform,
        )?;
    }
    push_optional_registered_hotkey(
        &mut plan,
        HotkeyRole::EditSelection,
        config.edit_selection.as_ref(),
        platform,
    )?;
    push_optional_registered_hotkey(
        &mut plan,
        HotkeyRole::SwitchScene,
        config.switch_scene.as_ref(),
        platform,
    )?;
    push_optional_registered_hotkey(
        &mut plan,
        HotkeyRole::OpenApp,
        config.open_app.as_ref(),
        platform,
    )?;
    if let Some(binding) = config.switch_language.as_ref() {
        push_switch_language_hotkey(&mut plan, binding, platform)?;
    }

    Ok(plan)
}

/// Adds the Switch language shortcut. It always goes through the native listener, because
/// that listener can ignore it until a Translate recording runs; a global shortcut would take
/// the key away from every app all the time. Generic modifiers mean either side, so `Shift`
/// becomes two chords, Left Shift and Right Shift. Only macOS has this listener; elsewhere the
/// shortcut is left out.
fn push_switch_language_hotkey(
    plan: &mut HotkeyRegistrationPlan,
    binding: &storage::ShortcutBinding,
    platform: &str,
) -> Result<(), HotkeyPairError> {
    if platform != "macos" {
        return Ok(());
    }
    let role = HotkeyRole::SwitchLanguage;
    let chords = binding_key_names(binding)
        .and_then(|names| either_side_chords(&names))
        .ok_or_else(|| invalid_binding_error(role, 0, binding))?;
    for chord in chords {
        if let Some(conflict) = native_conflict(plan, &chord) {
            if conflict.role == role {
                continue;
            }
            return Err(conflict_error(role, 0, conflict.role, conflict.index));
        }
        plan.native.push(RegisteredNativeHotkey {
            role,
            index: 0,
            chord,
            display: binding_display(binding),
        });
    }
    Ok(())
}

/// All macOS chords a binding stands for when generic modifiers (`Shift`, `Ctrl`, `Option`,
/// `Command`) may be pressed on either side. `None` when a key is not in the native table.
fn either_side_chords(names: &[String]) -> Option<Vec<NativeChord>> {
    let mut combinations: Vec<Vec<u16>> = vec![Vec::new()];
    for name in names {
        let sides: Vec<&str> = match name.as_str() {
            "Shift" => vec!["LeftShift", "RightShift"],
            "Ctrl" => vec!["LeftControl", "RightControl"],
            "Option" | "Alt" => vec!["LeftOption", "RightOption"],
            "Command" | "Super" => vec!["LeftCommand", "RightCommand"],
            other => vec![other],
        };
        let codes = sides
            .iter()
            .map(|side| native_keys::key_by_name(side).map(|key| key.code))
            .collect::<Option<Vec<u16>>>()?;
        combinations = combinations
            .iter()
            .flat_map(|prefix| {
                codes.iter().map(move |code| {
                    let mut next = prefix.clone();
                    next.push(*code);
                    next
                })
            })
            .collect();
    }
    combinations.into_iter().map(NativeChord::new).collect()
}

pub fn registered_hotkeys_from_config(
    config: &storage::HotkeyConfig,
) -> Result<Vec<RegisteredHotkey>, HotkeyPairError> {
    Ok(hotkey_registration_plan_from_config(config)?.global)
}

pub fn role_for_shortcut(plan: &[RegisteredHotkey], shortcut: &Shortcut) -> Option<HotkeyRole> {
    plan.iter()
        .find(|registered| shortcuts_match(&registered.shortcut, shortcut))
        .map(|registered| registered.role)
}

pub fn role_for_global_shortcut(
    plan: &HotkeyRegistrationPlan,
    shortcut: &Shortcut,
) -> Option<HotkeyRole> {
    plan.global
        .iter()
        .find(|registered| shortcuts_match(&registered.shortcut, shortcut))
        .map(|registered| registered.role)
}

pub fn default_shortcut() -> Shortcut {
    let default_hotkey = storage::AppConfig::default().hotkey;
    let fallback = {
        #[cfg(target_os = "macos")]
        {
            Shortcut::new(Some(Modifiers::ALT), Code::Slash)
        }
        #[cfg(not(target_os = "macos"))]
        {
            Shortcut::new(Some(Modifiers::CONTROL), Code::Slash)
        }
    };
    parse_hotkey(&default_hotkey).unwrap_or(fallback)
}

pub fn default_ask_shortcut() -> Shortcut {
    let default_hotkey = storage::AppConfig::default().ask_hotkey;
    let fallback = {
        #[cfg(target_os = "macos")]
        {
            Shortcut::new(Some(Modifiers::SUPER), Code::Period)
        }
        #[cfg(not(target_os = "macos"))]
        {
            Shortcut::new(Some(Modifiers::CONTROL), Code::Period)
        }
    };
    parse_hotkey(&default_hotkey).unwrap_or(fallback)
}

fn shortcuts_match(a: &Shortcut, b: &Shortcut) -> bool {
    a.mods == b.mods && a.key == b.key
}

pub fn hotkeys_conflict(left: &str, right: &str) -> bool {
    if let (Some(left), Some(right)) = (
        storage::ShortcutBinding::from_hotkey(left),
        storage::ShortcutBinding::from_hotkey(right),
    ) {
        if storage::shortcut_binding_identity(&left) == storage::shortcut_binding_identity(&right) {
            return true;
        }
    }

    match (parse_hotkey(left), parse_hotkey(right)) {
        (Some(left), Some(right)) => shortcuts_match(&left, &right),
        _ => false,
    }
}

pub fn shortcut_from_binding(binding: &storage::ShortcutBinding) -> Option<Shortcut> {
    binding.to_hotkey_string().as_deref().and_then(parse_hotkey)
}

pub fn binding_is_valid_for_registration(binding: &storage::ShortcutBinding) -> bool {
    binding_is_valid_for_platform(binding, std::env::consts::OS)
}

pub fn binding_is_valid_for_platform(binding: &storage::ShortcutBinding, platform: &str) -> bool {
    native_chord_from_binding(binding, platform).is_some()
        || shortcut_from_binding(binding).is_some()
}

pub fn validate_hotkey_pair(
    dictation_hotkey: &str,
    ask_hotkey: &str,
) -> Result<(), HotkeyPairError> {
    let dictation = storage::ShortcutBinding::from_hotkey(dictation_hotkey)
        .ok_or_else(|| HotkeyPairError::InvalidDictationHotkey(dictation_hotkey.to_string()))?;
    let ask = storage::ShortcutBinding::from_hotkey(ask_hotkey)
        .ok_or_else(|| HotkeyPairError::InvalidAskHotkey(ask_hotkey.to_string()))?;
    let config = storage::HotkeyConfig {
        dictation_bindings: vec![dictation.clone()],
        ask_bindings: vec![ask.clone()],
        translate_bindings: Vec::new(),
        dictation,
        ask: Some(ask),
        translate: None,
        edit_selection: None,
        switch_scene: None,
        open_app: None,
        dictation_mode: "hold".to_string(),
        switch_language: None,
    };

    hotkey_registration_plan_from_config(&config).map(|_| ())
}

pub fn validate_hotkey_config(config: &storage::HotkeyConfig) -> Result<(), HotkeyPairError> {
    hotkey_registration_plan_from_config(config).map(|_| ())
}

pub(crate) fn validate_hotkey_config_for_platform(
    config: &storage::HotkeyConfig,
    platform: &str,
) -> Result<(), HotkeyPairError> {
    hotkey_registration_plan_from_config_for_platform(config, platform).map(|_| ())
}

fn is_ask_shortcut(handle: &tauri::AppHandle, shortcut: &Shortcut) -> bool {
    let ask_hotkey = handle
        .state::<AskHotkeyCache>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    parse_hotkey(&ask_hotkey)
        .map(|configured| shortcuts_match(&configured, shortcut))
        .unwrap_or(false)
}

fn hotkey_role_for_shortcut(handle: &tauri::AppHandle, shortcut: &Shortcut) -> HotkeyRole {
    if let Some(role_cache) = handle.try_state::<HotkeyRoleCache>() {
        let plan = role_cache
            .0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        if let Some(role) = role_for_global_shortcut(&plan, shortcut) {
            return role;
        }
    }

    if is_ask_shortcut(handle, shortcut) {
        HotkeyRole::Ask
    } else {
        HotkeyRole::Dictation
    }
}

fn show_ask_result_window(handle: &tauri::AppHandle, result: &commands::ask::AskDictationResult) {
    handle
        .state::<commands::ask::AskDictationState>()
        .set_pending_result(result.clone());
    match crate::show_ask_popup_window(handle) {
        Ok(window) => {
            let _ = window.emit("ask:result", result);
        }
        Err(error) => {
            tracing::error!("Failed to show Ask result window: {}", error);
        }
    }
}

fn show_ask_error_window(handle: &tauri::AppHandle, message: String) {
    handle
        .state::<commands::ask::AskDictationState>()
        .set_pending_error(message.clone());
    match crate::show_ask_popup_window(handle) {
        Ok(window) => {
            let _ = window.emit("ask:error", message);
        }
        Err(error) => {
            tracing::error!("Failed to show Ask error window: {}", error);
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum AskShortcutAction {
    Start,
    Stop,
    StopAfterStart,
    Ignore,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RecordingShortcutAction {
    Start {
        options: pipeline::PipelineStartOptions,
    },
    Stop,
    Ignore,
}

fn ask_shortcut_action(
    event_state: ShortcutState,
    is_recording: bool,
    is_starting: bool,
    is_busy: bool,
) -> AskShortcutAction {
    if event_state == ShortcutState::Released {
        return AskShortcutAction::Ignore;
    }

    if is_recording {
        return AskShortcutAction::Stop;
    }

    if is_starting {
        return AskShortcutAction::StopAfterStart;
    }

    if is_busy {
        return AskShortcutAction::Ignore;
    }

    AskShortcutAction::Start
}

fn recording_shortcut_action(
    hotkey_mode: &str,
    event_state: ShortcutState,
    pipeline_state: pipeline::PipelineState,
    options: pipeline::PipelineStartOptions,
) -> RecordingShortcutAction {
    let is_toggle_mode = hotkey_mode == "toggle";

    match (is_toggle_mode, event_state, pipeline_state) {
        (true, ShortcutState::Released, _) => RecordingShortcutAction::Ignore,
        (true, ShortcutState::Pressed, pipeline::PipelineState::Idle) => {
            RecordingShortcutAction::Start { options }
        }
        (true, ShortcutState::Pressed, _) => RecordingShortcutAction::Stop,
        (false, ShortcutState::Pressed, pipeline::PipelineState::Idle) => {
            RecordingShortcutAction::Start { options }
        }
        (false, ShortcutState::Pressed, _) => RecordingShortcutAction::Ignore,
        (false, ShortcutState::Released, _) => RecordingShortcutAction::Stop,
    }
}

async fn stop_ask_shortcut(handle: tauri::AppHandle) {
    if !handle
        .state::<commands::ask::AskDictationState>()
        .is_recording()
    {
        return;
    }

    let ask_state = handle.state::<commands::ask::AskDictationState>();
    let config_state = handle.state::<storage::ConfigManager>();
    let client = handle.state::<reqwest::Client>();

    match commands::ask::stop_ask_dictation(handle.clone(), ask_state, config_state, client).await {
        Ok(result) if result.should_show_window() => show_ask_result_window(&handle, &result),
        Ok(_) => {}
        Err(message) if message == "Ask dictation is not recording" => {}
        Err(message) if message == commands::ask::ASK_CANCELLED_ERROR => {}
        Err(message) => show_ask_error_window(&handle, message),
    }
}

fn start_ask_shortcut(handle: tauri::AppHandle) {
    let did_reserve_start = {
        let ask_state = handle.state::<commands::ask::AskDictationState>();
        ask_state.try_begin_starting()
    };
    if !did_reserve_start {
        return;
    }

    tauri::async_runtime::spawn(async move {
        let ask_state = handle.state::<commands::ask::AskDictationState>();
        let config_state = handle.state::<storage::ConfigManager>();
        let client = handle.state::<reqwest::Client>();

        if let Err(message) = commands::ask::start_reserved_ask_dictation(
            handle.clone(),
            ask_state,
            config_state,
            client,
            true,
        )
        .await
        {
            show_ask_error_window(&handle, message);
            return;
        }

        if handle
            .state::<commands::ask::AskDictationState>()
            .take_stop_after_start()
        {
            stop_ask_shortcut(handle).await;
        }
    });
}

fn handle_ask_shortcut(handle: tauri::AppHandle, action: AskShortcutAction) {
    match action {
        AskShortcutAction::Start => start_ask_shortcut(handle),
        AskShortcutAction::Stop => {
            tauri::async_runtime::spawn(stop_ask_shortcut(handle));
        }
        AskShortcutAction::StopAfterStart => {
            let _ = handle
                .state::<commands::ask::AskDictationState>()
                .request_stop_after_start();
        }
        AskShortcutAction::Ignore => {}
    }
}

fn handle_recording_shortcut(handle: tauri::AppHandle, action: RecordingShortcutAction) {
    match action {
        RecordingShortcutAction::Start { options } => {
            tauri::async_runtime::spawn(async move {
                if handle.state::<commands::ask::AskDictationState>().is_busy() {
                    return;
                }

                let pipeline = handle.state::<pipeline::PipelineHandle>();
                if let Err(e) = pipeline.start_with_options(options).await {
                    tracing::error!("Failed to start recording: {}", e);
                    let _ = handle.emit("pipeline:error", e.to_string());
                }
            });
        }
        RecordingShortcutAction::Stop => {
            tauri::async_runtime::spawn(async move {
                if handle.state::<commands::ask::AskDictationState>().is_busy() {
                    return;
                }

                let pipeline = handle.state::<pipeline::PipelineHandle>();
                if let Err(e) = pipeline.stop().await {
                    tracing::error!("Failed to stop recording: {}", e);
                    let _ = handle.emit("pipeline:error", e.to_string());
                }
            });
        }
        RecordingShortcutAction::Ignore => {}
    }
}

fn handle_advanced_role_shortcut(
    handle: tauri::AppHandle,
    role: HotkeyRole,
    event_state: ShortcutState,
) {
    if event_state != ShortcutState::Pressed {
        return;
    }
    let _ = handle.emit("hotkey:role", role.as_str());
}

/// True while a run is active that Escape should cancel: any non-idle dictation or Translate
/// state (preparing, recording, transcribing, polishing, pasting), or an Ask that is starting,
/// recording or thinking. Idle Escape is left alone.
pub fn escape_cancels_run(pipeline_state: pipeline::PipelineState, ask_busy: bool) -> bool {
    ask_busy || pipeline_state != pipeline::PipelineState::Idle
}

/// The Escape gate for the native key listener. Runs on the listener thread for each Escape
/// press, so it only reads state.
pub fn escape_gate(handle: &tauri::AppHandle) -> bool {
    let ask_busy = handle
        .try_state::<commands::ask::AskDictationState>()
        .is_some_and(|ask| ask.is_busy());
    let pipeline_state = handle
        .try_state::<pipeline::PipelineHandle>()
        .map_or(pipeline::PipelineState::Idle, |pipeline| {
            pipeline.current_state()
        });
    escape_cancels_run(pipeline_state, ask_busy)
}

/// Escape was pressed during a run: cancel it exactly like the pill's cancel button (Ask
/// cancel for an Ask run, abort for dictation and Translate). Runs off the listener thread,
/// because stopping audio capture may take a moment.
fn cancel_active_run(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn_blocking(move || {
        if handle.state::<commands::ask::AskDictationState>().is_busy() {
            tracing::info!("Escape: cancelling Ask");
            commands::ask::cancel_ask_run(&handle);
        } else {
            tracing::info!("Escape: cancelling the current run");
            handle.state::<pipeline::PipelineHandle>().abort();
        }
    });
}

pub fn handle_hotkey_role_event(
    handle: tauri::AppHandle,
    role: HotkeyRole,
    event_state: ShortcutState,
) {
    match role {
        HotkeyRole::Ask => {
            let ask_state = handle.state::<commands::ask::AskDictationState>();
            let action = ask_shortcut_action(
                event_state,
                ask_state.is_recording(),
                ask_state.is_starting(),
                ask_state.is_busy(),
            );
            handle_ask_shortcut(handle, action);
        }
        HotkeyRole::TranslateSelection => {
            let hotkey_mode = handle
                .state::<HotkeyModeCache>()
                .0
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone();
            // Pressing Translate again (or Dictate) while a Translate recording runs stops it
            // and pastes; the Switch language shortcut changes the language.
            let pipeline_state = handle.state::<pipeline::PipelineHandle>().current_state();
            let action = recording_shortcut_action(
                &hotkey_mode,
                event_state,
                pipeline_state,
                pipeline::PipelineStartOptions {
                    force_translate: true,
                },
            );
            handle_recording_shortcut(handle, action);
        }
        HotkeyRole::Dictation => {
            let ask_action = {
                let ask_state = handle.state::<commands::ask::AskDictationState>();
                let is_recording = ask_state.is_recording();
                let is_starting = ask_state.is_starting();
                if is_recording || is_starting {
                    Some(ask_shortcut_action(
                        event_state,
                        is_recording,
                        is_starting,
                        ask_state.is_busy(),
                    ))
                } else {
                    None
                }
            };
            if let Some(action) = ask_action {
                handle_ask_shortcut(handle, action);
                return;
            }

            let hotkey_mode = handle
                .state::<HotkeyModeCache>()
                .0
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone();
            let pipeline_state = handle.state::<pipeline::PipelineHandle>().current_state();
            let action = recording_shortcut_action(
                &hotkey_mode,
                event_state,
                pipeline_state,
                pipeline::PipelineStartOptions::default(),
            );
            handle_recording_shortcut(handle, action);
        }
        HotkeyRole::SwitchLanguage => {
            let pipeline = handle.state::<pipeline::PipelineHandle>();
            if commands::translation::switch_language_press_cycles_target(
                event_state,
                pipeline.current_state(),
                pipeline.is_translate_run(),
            ) {
                tauri::async_runtime::spawn(
                    commands::translation::cycle_translation_target_from_shortcut(handle.clone()),
                );
            }
        }
        HotkeyRole::Cancel => {
            if event_state == ShortcutState::Pressed {
                cancel_active_run(handle);
            }
        }
        role => handle_advanced_role_shortcut(handle, role, event_state),
    }
}

pub fn build_shortcut_handler(
    app_handle: tauri::AppHandle,
) -> impl Fn(&tauri::AppHandle, &Shortcut, tauri_plugin_global_shortcut::ShortcutEvent)
       + Send
       + Sync
       + 'static {
    move |_app, shortcut, event| {
        let handle = app_handle.clone();
        let role = hotkey_role_for_shortcut(&handle, shortcut);
        handle_hotkey_role_event(handle, role, event.state);
    }
}

pub fn parse_hotkey(s: &str) -> Option<Shortcut> {
    let parts: Vec<&str> = s.split('+').map(|p| p.trim()).collect();
    if parts.is_empty() {
        return None;
    }

    let mut modifiers = Modifiers::empty();
    let key_str = parts.last()?;

    for &part in &parts[..parts.len() - 1] {
        match part.to_lowercase().as_str() {
            "alt" | "option" => modifiers |= Modifiers::ALT,
            "ctrl" | "control" => modifiers |= Modifiers::CONTROL,
            "shift" => modifiers |= Modifiers::SHIFT,
            "meta" | "super" | "win" | "cmd" | "command" => modifiers |= Modifiers::SUPER,
            _ => return None,
        }
    }

    let code = match key_str.to_lowercase().as_str() {
        "space" => Code::Space,
        "tab" => Code::Tab,
        "enter" | "return" => Code::Enter,
        "backspace" => Code::Backspace,
        "escape" | "esc" => Code::Escape,
        "delete" => Code::Delete,
        "insert" => Code::Insert,
        "home" => Code::Home,
        "end" => Code::End,
        "pageup" => Code::PageUp,
        "pagedown" => Code::PageDown,
        "arrowup" | "up" => Code::ArrowUp,
        "arrowdown" | "down" => Code::ArrowDown,
        "arrowleft" | "left" => Code::ArrowLeft,
        "arrowright" | "right" => Code::ArrowRight,
        "f1" => Code::F1,
        "f2" => Code::F2,
        "f3" => Code::F3,
        "f4" => Code::F4,
        "f5" => Code::F5,
        "f6" => Code::F6,
        "f7" => Code::F7,
        "f8" => Code::F8,
        "f9" => Code::F9,
        "f10" => Code::F10,
        "f11" => Code::F11,
        "f12" => Code::F12,
        "a" => Code::KeyA,
        "b" => Code::KeyB,
        "c" => Code::KeyC,
        "d" => Code::KeyD,
        "e" => Code::KeyE,
        "f" => Code::KeyF,
        "g" => Code::KeyG,
        "h" => Code::KeyH,
        "i" => Code::KeyI,
        "j" => Code::KeyJ,
        "k" => Code::KeyK,
        "l" => Code::KeyL,
        "m" => Code::KeyM,
        "n" => Code::KeyN,
        "o" => Code::KeyO,
        "p" => Code::KeyP,
        "q" => Code::KeyQ,
        "r" => Code::KeyR,
        "s" => Code::KeyS,
        "t" => Code::KeyT,
        "u" => Code::KeyU,
        "v" => Code::KeyV,
        "w" => Code::KeyW,
        "x" => Code::KeyX,
        "y" => Code::KeyY,
        "z" => Code::KeyZ,
        "0" => Code::Digit0,
        "1" => Code::Digit1,
        "2" => Code::Digit2,
        "3" => Code::Digit3,
        "4" => Code::Digit4,
        "5" => Code::Digit5,
        "6" => Code::Digit6,
        "7" => Code::Digit7,
        "8" => Code::Digit8,
        "9" => Code::Digit9,
        "/" | "slash" => Code::Slash,
        "\\" | "backslash" => Code::Backslash,
        "." | "period" | "。" => Code::Period,
        "," | "comma" => Code::Comma,
        ";" | "semicolon" => Code::Semicolon,
        "'" | "quote" => Code::Quote,
        "`" | "backquote" => Code::Backquote,
        "-" | "minus" => Code::Minus,
        "=" | "equal" => Code::Equal,
        "[" | "bracketleft" => Code::BracketLeft,
        "]" | "bracketright" => Code::BracketRight,
        _ => return None,
    };

    let mods = if modifiers.is_empty() {
        None
    } else {
        Some(modifiers)
    };
    Some(Shortcut::new(mods, code))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_hotkey_ctrl_slash() {
        let s = parse_hotkey("Ctrl+/");
        assert!(s.is_some());
        let s = s.unwrap();
        assert_eq!(s.mods, Modifiers::CONTROL);
        assert_eq!(s.key, Code::Slash);
    }

    #[test]
    fn test_parse_hotkey_ctrl_shift_a() {
        let s = parse_hotkey("Ctrl+Shift+A");
        assert!(s.is_some());
        let s = s.unwrap();
        assert_eq!(s.mods, Modifiers::CONTROL | Modifiers::SHIFT);
        assert_eq!(s.key, Code::KeyA);
    }

    #[test]
    fn test_parse_hotkey_case_insensitive() {
        let s = parse_hotkey("cTrL+/");
        assert!(s.is_some());
        let s = s.unwrap();
        assert_eq!(s.mods, Modifiers::CONTROL);
        assert_eq!(s.key, Code::Slash);
    }

    #[test]
    fn test_parse_hotkey_option_slash() {
        let s = parse_hotkey("Option+/");
        assert!(s.is_some());
        let s = s.unwrap();
        assert_eq!(s.mods, Modifiers::ALT);
        assert_eq!(s.key, Code::Slash);
    }

    #[test]
    fn test_parse_hotkey_command_period() {
        for hotkey in ["Command+.", "Command+。"] {
            let s = parse_hotkey(hotkey);
            assert!(s.is_some(), "Failed to parse {hotkey}");
            let s = s.unwrap();
            assert_eq!(s.mods, Modifiers::SUPER);
            assert_eq!(s.key, Code::Period);
        }
    }

    #[test]
    fn test_parse_hotkey_ctrl_period() {
        let s = parse_hotkey("Ctrl+.");
        assert!(s.is_some());
        let s = s.unwrap();
        assert_eq!(s.mods, Modifiers::CONTROL);
        assert_eq!(s.key, Code::Period);
    }

    #[test]
    fn validates_distinct_hotkey_pair() {
        assert!(validate_hotkey_pair("Ctrl+/", "Ctrl+.").is_ok());
    }

    #[test]
    fn rejects_conflicting_hotkey_pair() {
        assert_eq!(
            validate_hotkey_pair("Ctrl+/", "Control+Slash").unwrap_err(),
            HotkeyPairError::ConflictingHotkeys
        );
    }

    #[test]
    fn rejects_invalid_dictation_hotkey() {
        assert_eq!(
            validate_hotkey_pair("Ctrl+Nope", "Ctrl+.").unwrap_err(),
            HotkeyPairError::InvalidDictationHotkey("Ctrl+Nope".to_string())
        );
    }

    #[test]
    fn rejects_invalid_ask_hotkey() {
        assert_eq!(
            validate_hotkey_pair("Ctrl+/", "Ctrl+Nope").unwrap_err(),
            HotkeyPairError::InvalidAskHotkey("Ctrl+Nope".to_string())
        );
    }

    #[test]
    fn invalid_advanced_role_hotkey_is_not_reported_as_ask_hotkey() {
        let mut config = storage::HotkeyConfig::from_legacy("Ctrl+/", "Ctrl+.", "hold");
        config.translate = Some(storage::ShortcutBinding {
            primary: "Nope".to_string(),
            modifiers: vec!["Ctrl".to_string()],
        });

        assert_eq!(
            validate_hotkey_config(&config).unwrap_err(),
            HotkeyPairError::InvalidRoleHotkey {
                role: "translate",
                value: "Nope".to_string(),
            }
        );
    }

    #[test]
    fn validates_typed_hotkey_config_and_rejects_role_collisions() {
        let mut config = storage::HotkeyConfig::from_legacy("Ctrl+/", "Ctrl+.", "hold");

        assert!(validate_hotkey_config(&config).is_ok());

        config.ask = Some(storage::ShortcutBinding {
            primary: "/".to_string(),
            modifiers: vec!["Control".to_string()],
        });
        config.ask_bindings = config.ask.clone().into_iter().collect();

        assert_eq!(
            validate_hotkey_config(&config).unwrap_err(),
            HotkeyPairError::ConflictingHotkeys
        );
    }

    #[test]
    fn native_single_key_dictation_uses_native_adapter_plan() {
        let dictation = storage::ShortcutBinding {
            primary: "RightAlt".to_string(),
            modifiers: vec![],
        };
        let ask = storage::ShortcutBinding::from_hotkey("Ctrl+.");
        let config = storage::HotkeyConfig {
            dictation_bindings: vec![dictation.clone()],
            ask_bindings: ask.clone().into_iter().collect(),
            translate_bindings: Vec::new(),
            dictation,
            ask,
            translate: None,
            edit_selection: None,
            switch_scene: None,
            open_app: None,
            dictation_mode: "toggle".to_string(),
            switch_language: None,
        };

        let plan = hotkey_registration_plan_from_config_for_platform(&config, "windows").unwrap();

        assert_eq!(plan.native.len(), 1);
        assert_eq!(plan.native[0].role, HotkeyRole::Dictation);
        assert_eq!(plan.native[0].chord, NativeChord::new([0xA5]).unwrap());
        assert_eq!(plan.global.len(), 1);
        assert_eq!(plan.global[0].role, HotkeyRole::Ask);
    }

    #[test]
    fn native_typeless_mode_shortcuts_use_native_adapter_plan() {
        let dictation = storage::ShortcutBinding::from_hotkey("Fn").unwrap();
        let ask = storage::ShortcutBinding::from_hotkey("Fn+Space");
        let translate = storage::ShortcutBinding::from_hotkey("Fn+LeftShift");
        let config = storage::HotkeyConfig {
            dictation_bindings: vec![dictation.clone()],
            ask_bindings: ask.clone().into_iter().collect(),
            translate_bindings: translate.clone().into_iter().collect(),
            dictation,
            ask,
            translate,
            edit_selection: None,
            switch_scene: None,
            open_app: None,
            dictation_mode: "toggle".to_string(),
            switch_language: None,
        };

        let plan = hotkey_registration_plan_from_config_for_platform(&config, "macos").unwrap();

        assert!(plan.global.is_empty());
        assert!(plan.native.iter().any(|entry| {
            entry.role == HotkeyRole::Dictation && entry.chord == mac_chord(&["Fn"])
        }));
        assert!(plan.native.iter().any(|entry| {
            entry.role == HotkeyRole::Ask && entry.chord == mac_chord(&["Fn", "Space"])
        }));
        assert!(plan.native.iter().any(|entry| {
            entry.role == HotkeyRole::TranslateSelection
                && entry.chord == mac_chord(&["Fn", "LeftShift"])
        }));
    }

    fn end_hotkey_config() -> storage::HotkeyConfig {
        let dictation = storage::ShortcutBinding::from_hotkey("End").unwrap();
        let ask = storage::ShortcutBinding::from_hotkey("End+RightShift").unwrap();
        let translate = storage::ShortcutBinding::from_hotkey("End+RightControl").unwrap();
        storage::HotkeyConfig {
            dictation_bindings: vec![dictation.clone()],
            ask_bindings: vec![ask.clone()],
            translate_bindings: vec![translate.clone()],
            dictation,
            ask: Some(ask),
            translate: Some(translate),
            edit_selection: None,
            switch_scene: None,
            open_app: None,
            dictation_mode: "hold".to_string(),
            switch_language: None,
        }
    }

    #[test]
    fn end_family_bindings_register_as_native_on_macos() {
        let plan = hotkey_registration_plan_from_config_for_platform(&end_hotkey_config(), "macos")
            .unwrap();

        assert!(plan.global.is_empty());
        let chords: Vec<_> = plan
            .native
            .iter()
            .map(|entry| entry.chord.clone())
            .collect();
        assert_eq!(
            chords,
            vec![
                mac_chord(&["End"]),
                mac_chord(&["End", "RightShift"]),
                mac_chord(&["End", "RightControl"]),
            ]
        );
    }

    #[test]
    fn bare_end_falls_back_to_global_shortcut_off_macos() {
        let binding = storage::ShortcutBinding::from_hotkey("End").unwrap();

        assert!(binding_is_valid_for_platform(&binding, "windows"));
        assert!(!binding_is_valid_for_platform(
            &storage::ShortcutBinding::from_hotkey("End+RightShift").unwrap(),
            "windows"
        ));
    }

    #[test]
    fn fn_dictation_conflicts_with_fn_ask_binding() {
        let dictation = storage::ShortcutBinding {
            primary: "Fn".to_string(),
            modifiers: vec![],
        };
        let ask = storage::ShortcutBinding {
            primary: "Fn".to_string(),
            modifiers: vec![],
        };
        let config = storage::HotkeyConfig {
            dictation_bindings: vec![dictation.clone()],
            ask_bindings: vec![ask.clone()],
            translate_bindings: Vec::new(),
            dictation,
            ask: Some(ask),
            translate: None,
            edit_selection: None,
            switch_scene: None,
            open_app: None,
            dictation_mode: "toggle".to_string(),
            switch_language: None,
        };

        assert_eq!(
            hotkey_registration_plan_from_config_for_platform(&config, "macos").unwrap_err(),
            HotkeyPairError::ConflictingHotkeys
        );
    }

    #[test]
    fn new_install_default_hotkeys_have_platform_registration_plan() {
        let config = storage::AppConfig::new_install_default();
        let plan = crate::hotkey::hotkey_registration_plan_from_config(&config.hotkeys).unwrap();

        #[cfg(target_os = "macos")]
        {
            assert!(plan.native.iter().any(|entry| {
                entry.role == HotkeyRole::Dictation && entry.chord == mac_chord(&["Fn"])
            }));
            assert!(plan.native.iter().any(|entry| {
                entry.role == HotkeyRole::Ask && entry.chord == mac_chord(&["Fn", "Space"])
            }));
            assert!(plan.native.iter().any(|entry| {
                entry.role == HotkeyRole::TranslateSelection
                    && entry.chord == mac_chord(&["Fn", "LeftShift"])
            }));
            assert!(!plan
                .global
                .iter()
                .any(|entry| entry.role == HotkeyRole::Dictation));
        }

        #[cfg(target_os = "windows")]
        {
            assert!(plan
                .global
                .iter()
                .any(|entry| entry.role == HotkeyRole::Dictation));
            assert!(plan
                .global
                .iter()
                .any(|entry| entry.role == HotkeyRole::Ask));
            assert!(plan
                .global
                .iter()
                .any(|entry| entry.role == HotkeyRole::TranslateSelection));
            assert!(plan.native.is_empty());
        }

        #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
        {
            assert!(plan
                .global
                .iter()
                .any(|entry| entry.role == HotkeyRole::Dictation));
            assert!(!plan
                .native
                .iter()
                .any(|entry| entry.role == HotkeyRole::Dictation));
        }
    }

    #[test]
    fn hotkey_registration_plan_includes_all_configured_roles() {
        let mut config = storage::HotkeyConfig::from_legacy("Ctrl+/", "Ctrl+.", "hold");
        config.translate = storage::ShortcutBinding::from_hotkey("Ctrl+Shift+T");
        config.edit_selection = storage::ShortcutBinding::from_hotkey("Ctrl+Shift+E");
        config.switch_scene = storage::ShortcutBinding::from_hotkey("Ctrl+Shift+S");
        config.open_app = storage::ShortcutBinding::from_hotkey("Ctrl+Shift+O");

        let plan = registered_hotkeys_from_config(&config).unwrap();
        let roles: Vec<HotkeyRole> = plan.iter().map(|entry| entry.role).collect();

        assert_eq!(
            roles,
            vec![
                HotkeyRole::Dictation,
                HotkeyRole::Ask,
                HotkeyRole::TranslateSelection,
                HotkeyRole::EditSelection,
                HotkeyRole::SwitchScene,
                HotkeyRole::OpenApp,
            ]
        );
    }

    #[test]
    fn hotkey_binding_lists_register_every_core_binding_with_stable_indices() {
        let mut config = storage::HotkeyConfig::from_legacy("Ctrl+/", "Ctrl+.", "hold");
        config.dictation_bindings = vec![
            storage::ShortcutBinding::from_hotkey("Ctrl+/").unwrap(),
            storage::ShortcutBinding::from_hotkey("F8").unwrap(),
        ];
        config.ask_bindings = vec![
            storage::ShortcutBinding::from_hotkey("Ctrl+.").unwrap(),
            storage::ShortcutBinding::from_hotkey("F9").unwrap(),
        ];
        config.translate_bindings =
            vec![storage::ShortcutBinding::from_hotkey("Ctrl+Shift+T").unwrap()];

        let plan = hotkey_registration_plan_from_config(&config).unwrap();
        let core: Vec<(HotkeyRole, usize)> = plan
            .global
            .iter()
            .map(|entry| (entry.role, entry.index))
            .collect();

        assert_eq!(
            core,
            vec![
                (HotkeyRole::Dictation, 0),
                (HotkeyRole::Dictation, 1),
                (HotkeyRole::Ask, 0),
                (HotkeyRole::Ask, 1),
                (HotkeyRole::TranslateSelection, 0),
            ]
        );
    }

    #[test]
    fn hotkey_binding_lists_reject_secondary_cross_role_conflicts() {
        let mut config = storage::HotkeyConfig::from_legacy("Ctrl+/", "Ctrl+.", "hold");
        config
            .dictation_bindings
            .push(storage::ShortcutBinding::from_hotkey("Ctrl+Shift+E").unwrap());
        config.edit_selection = storage::ShortcutBinding::from_hotkey("Ctrl+Shift+E");

        assert_eq!(
            hotkey_registration_plan_from_config(&config).unwrap_err(),
            HotkeyPairError::ConflictingRoleHotkeys {
                role: HotkeyRole::EditSelection,
                index: 0,
                conflict_role: HotkeyRole::Dictation,
                conflict_index: 1,
            }
        );
    }

    #[test]
    fn hotkey_binding_lists_reject_duplicate_normalized_triggers() {
        let mut config = storage::HotkeyConfig::from_legacy("Ctrl+/", "", "hold");
        config.dictation_bindings = vec![
            storage::ShortcutBinding {
                primary: "/".to_string(),
                modifiers: vec!["Control".to_string()],
            },
            storage::ShortcutBinding {
                primary: "/".to_string(),
                modifiers: vec!["Ctrl".to_string()],
            },
        ];

        assert!(matches!(
            hotkey_registration_plan_from_config(&config),
            Err(HotkeyPairError::ConflictingRoleHotkeys {
                role: HotkeyRole::Dictation,
                index: 1,
                conflict_role: HotkeyRole::Dictation,
                conflict_index: 0,
            })
        ));
    }

    #[test]
    fn hotkey_binding_lists_validate_native_triggers_for_target_platform() {
        let binding = |value: &str| storage::ShortcutBinding::from_hotkey(value).unwrap();
        assert!(native_chord_from_binding(&binding("Fn+Space"), "macos").is_some());
        assert!(native_chord_from_binding(&binding("RightAlt+LeftShift"), "windows").is_some());
        assert!(native_chord_from_binding(&binding("Fn"), "windows").is_none());
        assert!(native_chord_from_binding(&binding("Fn"), "linux").is_none());
        // RightAlt is the Windows name of Right Option.
        assert_eq!(
            native_chord_from_binding(&binding("RightAlt"), "macos"),
            Some(mac_chord(&["RightOption"]))
        );
        assert_eq!(
            validate_hotkey_config_for_platform(
                &storage::HotkeyConfig::from_legacy("Fn", "Ctrl+.", "toggle"),
                "windows"
            )
            .unwrap_err(),
            HotkeyPairError::UnsupportedNativeHotkey {
                role: HotkeyRole::Dictation,
                index: 0,
                value: "Fn".to_string(),
                platform: "windows".to_string(),
            }
        );
    }

    fn mac_chord(names: &[&str]) -> NativeChord {
        NativeChord::new(
            names
                .iter()
                .map(|name| native_keys::key_by_name(name).unwrap().code),
        )
        .unwrap()
    }

    fn binding(primary: &str, modifiers: &[&str]) -> storage::ShortcutBinding {
        storage::ShortcutBinding {
            primary: primary.to_string(),
            modifiers: modifiers.iter().map(|m| m.to_string()).collect(),
        }
    }

    /// The bindings exactly as the user's settings store them today.
    fn users_stored_config() -> storage::HotkeyConfig {
        let dictation = binding("End", &[]);
        let ask = binding("RightControl", &["End"]);
        let translate = binding("RightShift", &["End"]);
        storage::HotkeyConfig {
            dictation_bindings: vec![dictation.clone()],
            ask_bindings: vec![ask.clone()],
            translate_bindings: vec![translate.clone()],
            dictation,
            ask: Some(ask),
            translate: Some(translate),
            edit_selection: None,
            switch_scene: None,
            open_app: None,
            dictation_mode: "toggle".to_string(),
            switch_language: None,
        }
    }

    #[test]
    fn users_stored_bindings_map_to_native_chords_on_macos() {
        let plan =
            hotkey_registration_plan_from_config_for_platform(&users_stored_config(), "macos")
                .unwrap();
        assert!(plan.global.is_empty());
        let entries: Vec<_> = plan
            .native
            .iter()
            .map(|entry| (entry.role, entry.chord.clone(), entry.display.as_str()))
            .collect();
        assert_eq!(
            entries,
            vec![
                (
                    HotkeyRole::Dictation,
                    NativeChord::new([119]).unwrap(),
                    "End"
                ),
                (
                    HotkeyRole::Ask,
                    NativeChord::new([119, 62]).unwrap(),
                    "End+RightControl"
                ),
                (
                    HotkeyRole::TranslateSelection,
                    NativeChord::new([119, 60]).unwrap(),
                    "End+RightShift"
                ),
            ]
        );
    }

    #[test]
    fn native_chord_identity_ignores_key_order() {
        let stored = binding("RightShift", &["End"]);
        let captured = binding("End", &["RightShift"]);
        assert_eq!(
            native_chord_from_binding(&stored, "macos"),
            native_chord_from_binding(&captured, "macos")
        );
        assert!(hotkeys_conflict("End+RightShift", "RightShift+End"));

        let mut config = users_stored_config();
        config.dictation_bindings.push(captured);
        assert!(matches!(
            hotkey_registration_plan_from_config_for_platform(&config, "macos"),
            Err(HotkeyPairError::ConflictingRoleHotkeys {
                role: HotkeyRole::TranslateSelection,
                conflict_role: HotkeyRole::Dictation,
                conflict_index: 1,
                ..
            })
        ));
    }

    #[test]
    fn native_routing_covers_new_key_shapes() {
        let chord = |primary: &str, modifiers: &[&str]| {
            native_chord_from_binding(&binding(primary, modifiers), "macos")
        };
        // Native-only keys.
        assert_eq!(chord("F13", &[]), Some(mac_chord(&["F13"])));
        assert_eq!(chord("Home", &[]), Some(mac_chord(&["Home"])));
        assert_eq!(
            chord("K", &["RightCommand"]),
            Some(mac_chord(&["RightCommand", "K"]))
        );
        // Only modifiers.
        assert_eq!(
            chord("RightShift", &["RightControl"]),
            Some(mac_chord(&["RightShift", "RightControl"]))
        );
        // Three keys, any order.
        assert_eq!(
            chord("End", &["RightShift", "RightControl"]),
            Some(mac_chord(&["End", "RightShift", "RightControl"]))
        );
        // Plain shortcuts stay with the global-shortcut plugin.
        assert_eq!(chord("/", &["Ctrl"]), None);
        assert_eq!(chord("End", &["Ctrl"]), None);
        assert_eq!(chord("F5", &[]), None);
        assert!(binding_is_valid_for_platform(&binding("F13", &[]), "macos"));
        assert!(!binding_is_valid_for_platform(
            &binding("F13", &[]),
            "linux"
        ));
    }

    #[test]
    fn typed_binding_parser_rejects_duplicate_modifiers() {
        let binding = storage::ShortcutBinding {
            primary: "/".to_string(),
            modifiers: vec!["Ctrl".to_string(), "Control".to_string()],
        };

        assert!(shortcut_from_binding(&binding).is_none());
    }

    #[test]
    fn ask_shortcut_is_toggle_only_and_ignores_release() {
        assert_eq!(
            ask_shortcut_action(ShortcutState::Pressed, false, false, false),
            AskShortcutAction::Start
        );
        assert_eq!(
            ask_shortcut_action(ShortcutState::Pressed, true, false, true),
            AskShortcutAction::Stop
        );
        assert_eq!(
            ask_shortcut_action(ShortcutState::Pressed, false, true, true),
            AskShortcutAction::StopAfterStart
        );
        assert_eq!(
            ask_shortcut_action(ShortcutState::Released, true, false, true),
            AskShortcutAction::Ignore
        );
        assert_eq!(
            ask_shortcut_action(ShortcutState::Pressed, false, false, true),
            AskShortcutAction::Ignore
        );
    }

    #[test]
    fn translation_shortcut_starts_recording_with_translate_override() {
        assert_eq!(
            recording_shortcut_action(
                "hold",
                ShortcutState::Pressed,
                pipeline::PipelineState::Idle,
                pipeline::PipelineStartOptions {
                    force_translate: true,
                },
            ),
            RecordingShortcutAction::Start {
                options: pipeline::PipelineStartOptions {
                    force_translate: true,
                },
            }
        );

        assert_eq!(
            recording_shortcut_action(
                "hold",
                ShortcutState::Released,
                pipeline::PipelineState::Recording,
                pipeline::PipelineStartOptions {
                    force_translate: true,
                },
            ),
            RecordingShortcutAction::Stop
        );
    }

    #[test]
    fn translate_or_dictate_press_finishes_a_translate_recording_in_toggle_mode() {
        let translate = pipeline::PipelineStartOptions {
            force_translate: true,
        };
        // Pressing Translate again stops and pastes (it no longer switches language).
        assert_eq!(
            recording_shortcut_action(
                "toggle",
                ShortcutState::Pressed,
                pipeline::PipelineState::Recording,
                translate,
            ),
            RecordingShortcutAction::Stop
        );
        // So does the Dictate shortcut.
        assert_eq!(
            recording_shortcut_action(
                "toggle",
                ShortcutState::Pressed,
                pipeline::PipelineState::Recording,
                pipeline::PipelineStartOptions::default(),
            ),
            RecordingShortcutAction::Stop
        );
        // Hold mode: releasing either one finishes.
        assert_eq!(
            recording_shortcut_action(
                "hold",
                ShortcutState::Released,
                pipeline::PipelineState::Recording,
                pipeline::PipelineStartOptions::default(),
            ),
            RecordingShortcutAction::Stop
        );
    }

    #[test]
    fn switch_language_registers_either_shift_natively_on_macos_only() {
        let config = storage::AppConfig::new_install_default().hotkeys;
        let plan = hotkey_registration_plan_for_platform(&config, "macos");
        let switch: Vec<&NativeChord> = plan
            .native
            .iter()
            .filter(|entry| entry.role == HotkeyRole::SwitchLanguage)
            .map(|entry| &entry.chord)
            .collect();
        assert_eq!(
            switch,
            vec![&mac_chord(&["LeftShift"]), &mac_chord(&["RightShift"])]
        );
        assert!(!plan
            .global
            .iter()
            .any(|entry| entry.role == HotkeyRole::SwitchLanguage));

        let mut windows = storage::HotkeyConfig::from_legacy("Ctrl+/", "Ctrl+.", "hold");
        windows.switch_language = storage::default_switch_language_binding();
        let plan = hotkey_registration_plan_from_config_for_platform(&windows, "windows").unwrap();
        assert!(!plan
            .native
            .iter()
            .any(|entry| entry.role == HotkeyRole::SwitchLanguage));
    }

    fn hotkey_registration_plan_for_platform(
        config: &storage::HotkeyConfig,
        platform: &str,
    ) -> HotkeyRegistrationPlan {
        hotkey_registration_plan_from_config_for_platform(config, platform).unwrap()
    }

    #[test]
    fn switch_language_expands_generic_modifiers_and_keeps_side_specific_keys() {
        let mut config = users_stored_config();
        config.switch_language = storage::ShortcutBinding::from_hotkey("RightOption");
        let plan = hotkey_registration_plan_for_platform(&config, "macos");
        let switch: Vec<&NativeChord> = plan
            .native
            .iter()
            .filter(|entry| entry.role == HotkeyRole::SwitchLanguage)
            .map(|entry| &entry.chord)
            .collect();
        assert_eq!(switch, vec![&mac_chord(&["RightOption"])]);

        config.switch_language = storage::ShortcutBinding::from_hotkey("Ctrl+Shift");
        let plan = hotkey_registration_plan_for_platform(&config, "macos");
        assert_eq!(
            plan.native
                .iter()
                .filter(|entry| entry.role == HotkeyRole::SwitchLanguage)
                .count(),
            4
        );
    }

    #[test]
    fn switch_language_may_share_keys_with_translate_but_not_repeat_a_shortcut() {
        // The user's Translate chord (End + Right Shift) contains Right Shift: allowed.
        let mut config = users_stored_config();
        config.switch_language = storage::default_switch_language_binding();
        assert!(hotkey_registration_plan_from_config_for_platform(&config, "macos").is_ok());

        // The same key as Dictate is rejected.
        config.switch_language = storage::ShortcutBinding::from_hotkey("End");
        assert_eq!(
            hotkey_registration_plan_from_config_for_platform(&config, "macos").unwrap_err(),
            HotkeyPairError::ConflictingRoleHotkeys {
                role: HotkeyRole::SwitchLanguage,
                index: 0,
                conflict_role: HotkeyRole::Dictation,
                conflict_index: 0,
            }
        );
    }

    #[test]
    fn escape_cancels_only_while_a_run_is_active() {
        use pipeline::PipelineState::*;
        assert!(
            !escape_cancels_run(Idle, false),
            "idle Escape passes through"
        );
        for state in [
            Preparing,
            Recording,
            Transcribing,
            Polishing,
            Outputting,
            AskRecording,
            AskThinking,
        ] {
            assert!(escape_cancels_run(state, false), "{state:?}");
        }
        assert!(
            escape_cancels_run(Idle, true),
            "Ask starting, recording or thinking"
        );
    }

    #[test]
    fn hold_release_queues_stop_even_when_start_is_still_pending() {
        assert_eq!(
            recording_shortcut_action(
                "hold",
                ShortcutState::Released,
                pipeline::PipelineState::Idle,
                pipeline::PipelineStartOptions::default(),
            ),
            RecordingShortcutAction::Stop
        );
    }

    #[test]
    fn test_parse_hotkey_f_keys() {
        for (key, expected) in [("F1", Code::F1), ("F12", Code::F12)] {
            let s = parse_hotkey(&format!("Ctrl+{}", key));
            assert!(s.is_some(), "Failed to parse Ctrl+{}", key);
            assert_eq!(s.unwrap().key, expected);
        }
    }

    #[test]
    fn test_parse_hotkey_meta_modifier() {
        for name in ["Meta", "Super", "Win", "Cmd", "Command"] {
            let s = parse_hotkey(&format!("{}+A", name));
            assert!(s.is_some(), "Failed to parse {}+A", name);
            assert_eq!(s.unwrap().mods, Modifiers::SUPER);
        }
    }

    #[test]
    fn test_parse_hotkey_no_modifier() {
        let s = parse_hotkey("A");
        assert!(s.is_some());
        assert_eq!(s.unwrap().mods, Modifiers::empty());
    }

    #[test]
    fn test_parse_hotkey_invalid_key() {
        let s = parse_hotkey("Alt+InvalidKey");
        assert!(s.is_none());
    }

    #[test]
    fn test_parse_hotkey_empty_string() {
        let s = parse_hotkey("");
        assert!(s.is_none());
    }

    #[test]
    fn test_parse_hotkey_digits() {
        let s = parse_hotkey("Ctrl+0");
        assert!(s.is_some());
        assert_eq!(s.unwrap().key, Code::Digit0);

        let s = parse_hotkey("Ctrl+9");
        assert!(s.is_some());
        assert_eq!(s.unwrap().key, Code::Digit9);
    }

    #[test]
    fn test_parse_hotkey_navigation_keys() {
        for (key, expected) in [
            ("Enter", Code::Enter),
            ("Tab", Code::Tab),
            ("Escape", Code::Escape),
            ("Backspace", Code::Backspace),
            ("Delete", Code::Delete),
            ("Up", Code::ArrowUp),
            ("Down", Code::ArrowDown),
        ] {
            let s = parse_hotkey(&format!("Alt+{}", key));
            assert!(s.is_some(), "Failed to parse Alt+{}", key);
            assert_eq!(s.unwrap().key, expected);
        }
    }

    #[test]
    fn hotkey_supervisor_starts_in_starting_and_keeps_failed_retry_state() {
        let supervisor = HotkeySupervisor::default();
        let generation = supervisor.snapshot().generation;

        assert_eq!(supervisor.snapshot().state, HotkeySupervisorState::Starting);

        supervisor.record_registration_failure(generation, "shortcut is occupied".to_string());

        let snapshot = supervisor.snapshot();
        assert_eq!(snapshot.state, HotkeySupervisorState::Failed);
        assert_eq!(snapshot.last_error.as_deref(), Some("shortcut is occupied"));
        assert_eq!(snapshot.retry_attempts, 1);
        assert_eq!(
            supervisor.next_retry_delay(),
            Some(std::time::Duration::from_secs(
                HOTKEY_SUPERVISOR_RETRY_DELAY_SECS
            ))
        );
    }

    #[test]
    fn hotkey_supervisor_stops_fast_retry_after_configured_attempts() {
        let supervisor = HotkeySupervisor::default();

        for attempt in 0..=HOTKEY_SUPERVISOR_FAST_RETRY_LIMIT {
            let generation = supervisor.begin_registration_attempt();
            supervisor
                .record_registration_failure(generation, format!("registration failed {attempt}"));
        }

        let snapshot = supervisor.snapshot();
        assert_eq!(
            snapshot.retry_attempts,
            HOTKEY_SUPERVISOR_FAST_RETRY_LIMIT + 1
        );
        assert_eq!(supervisor.next_retry_delay(), None);
    }

    #[test]
    fn hotkey_supervisor_settings_change_resets_retry_window() {
        let supervisor = HotkeySupervisor::default();
        let first_generation = supervisor.snapshot().generation;
        supervisor.record_registration_failure(first_generation, "occupied".to_string());

        let next_generation = supervisor.wake_for_settings_change();
        let snapshot = supervisor.snapshot();

        assert!(next_generation > first_generation);
        assert_eq!(snapshot.state, HotkeySupervisorState::Starting);
        assert_eq!(snapshot.retry_attempts, 0);
        assert_eq!(snapshot.last_error, None);
        assert_eq!(supervisor.next_retry_delay(), None);
    }

    #[test]
    fn hotkey_supervisor_generation_guard_rejects_old_generation() {
        let supervisor = HotkeySupervisor::default();
        let old_generation = supervisor.snapshot().generation;

        assert!(supervisor.is_current_generation(old_generation));

        let next_generation = supervisor.wake_for_settings_change();

        assert!(!supervisor.is_current_generation(old_generation));
        assert!(supervisor.is_current_generation(next_generation));
    }

    #[test]
    fn hotkey_supervisor_run_if_current_generation_runs_matching_closure() {
        let supervisor = HotkeySupervisor::default();
        let generation = supervisor.snapshot().generation;

        let result = supervisor.run_if_current_generation(generation, || "registered");

        assert_eq!(result, Some("registered"));
    }

    #[test]
    fn hotkey_supervisor_run_if_current_generation_skips_superseded_closure() {
        let supervisor = HotkeySupervisor::default();
        let stale_generation = supervisor.snapshot().generation;
        supervisor.wake_for_settings_change();
        let mut called = false;

        let result = supervisor.run_if_current_generation(stale_generation, || {
            called = true;
        });

        assert_eq!(result, None);
        assert!(!called);
    }

    #[test]
    fn hotkey_supervisor_disable_invalidates_in_flight_generation() {
        let supervisor = HotkeySupervisor::default();
        let in_flight_generation = supervisor.snapshot().generation;

        let disabled_generation = supervisor.disable();

        assert!(!supervisor.is_current_generation(in_flight_generation));
        assert!(supervisor.is_current_generation(disabled_generation));
        assert_eq!(supervisor.snapshot().state, HotkeySupervisorState::Disabled);
        assert_eq!(supervisor.next_retry_delay(), None);
    }

    #[test]
    fn hotkey_supervisor_success_clears_last_error() {
        let supervisor = HotkeySupervisor::default();
        let generation = supervisor.snapshot().generation;
        supervisor.record_registration_failure(generation, "occupied".to_string());
        let retry_generation = supervisor.begin_registration_attempt();

        supervisor.record_registration_success(retry_generation);

        let snapshot = supervisor.snapshot();
        assert_eq!(snapshot.state, HotkeySupervisorState::Installed);
        assert_eq!(snapshot.retry_attempts, 0);
        assert_eq!(snapshot.last_error, None);
    }
}
