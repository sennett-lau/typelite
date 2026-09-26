//! Plan `onboarding-shortcut-gate`: which shortcut roles may run right now.
//!
//! While onboarding is not finished, no shortcut starts anything and the pill never shows,
//! except on the tutorial's exercise pages, where the frontend opens the gate for exactly the
//! role being taught (`set_shortcut_gate`). The gate starts closed when the stored
//! `onboarding_completed` flag is not set, so nothing slips through before the webview loads.
//!
//! Every entry point asks the same gate: `hotkey::handle_hotkey_role_event` (native listener
//! and global shortcuts), the native listener's swallow decision (a gated key passes through to
//! the focused app), the `typelite toggle` / `typelite ask` command-line actions and the tray.
//! Escape (`HotkeyRole::Cancel`) is never gated.

use crate::hotkey::HotkeyRole;
use serde::Deserialize;
use std::collections::BTreeSet;
use std::sync::{Arc, RwLock};

/// What the gate allows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShortcutGate {
    /// Normal use: every role.
    All,
    /// Onboarding: only these roles (empty: none).
    Only(BTreeSet<HotkeyRole>),
}

impl ShortcutGate {
    /// Nothing allowed (except Escape, which is never gated).
    pub fn closed() -> Self {
        Self::Only(BTreeSet::new())
    }

    /// The gate at app start: open once onboarding was finished, closed before that.
    pub fn at_startup(onboarding_completed: bool) -> Self {
        if onboarding_completed {
            Self::All
        } else {
            Self::closed()
        }
    }

    /// True when a press of `role` may do something now.
    pub fn allows(&self, role: HotkeyRole) -> bool {
        match self {
            Self::All => true,
            Self::Only(roles) => role == HotkeyRole::Cancel || roles.contains(&role),
        }
    }

    /// Builds the gate the frontend asked for. Unknown role names are an error, so a typo
    /// cannot silently open or close the gate.
    pub fn from_request(request: ShortcutGateRequest) -> Result<Self, String> {
        match request {
            ShortcutGateRequest::Keyword(keyword) if keyword == "all" => Ok(Self::All),
            ShortcutGateRequest::Keyword(other) => Err(format!(
                "unknown shortcut gate \"{other}\" (expected \"all\" or a list of roles)"
            )),
            ShortcutGateRequest::Roles(names) => names
                .iter()
                .map(|name| {
                    HotkeyRole::from_name(name)
                        .ok_or_else(|| format!("unknown shortcut role \"{name}\""))
                })
                .collect::<Result<BTreeSet<_>, _>>()
                .map(Self::Only),
        }
    }

    /// Short text for the log: `all` or the allowed role names.
    pub fn describe(&self) -> String {
        match self {
            Self::All => "all".to_string(),
            Self::Only(roles) if roles.is_empty() => "none".to_string(),
            Self::Only(roles) => roles
                .iter()
                .map(|role| role.as_str())
                .collect::<Vec<_>>()
                .join(", "),
        }
    }
}

/// The argument of `set_shortcut_gate`: the string `"all"`, or a list of role names as
/// `HotkeyRole::as_str` writes them (`dictation`, `translate`, `switchLanguage`, `ask`, …).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(untagged)]
pub enum ShortcutGateRequest {
    Keyword(String),
    Roles(Vec<String>),
}

/// The live gate, shared by the key listener thread, dispatch and the command. Reads are
/// cheap (the listener asks on every key press) and never wait on the listener.
#[derive(Debug, Clone)]
pub struct ShortcutGateState(Arc<RwLock<ShortcutGate>>);

impl ShortcutGateState {
    pub fn new(gate: ShortcutGate) -> Self {
        Self(Arc::new(RwLock::new(gate)))
    }

    pub fn get(&self) -> ShortcutGate {
        self.0.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn allows(&self, role: HotkeyRole) -> bool {
        self.0
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .allows(role)
    }

    /// Replaces the gate and returns the previous one.
    pub fn set(&self, gate: ShortcutGate) -> ShortcutGate {
        std::mem::replace(
            &mut *self.0.write().unwrap_or_else(|e| e.into_inner()),
            gate,
        )
    }
}

/// True when `role` may run now. Without a gate in the app state (tests, early startup
/// paths) everything is allowed, as before this plan. Logs a gated press at debug level with
/// the role only.
pub fn allows(handle: &tauri::AppHandle, role: HotkeyRole) -> bool {
    use tauri::Manager;
    let allowed = handle
        .try_state::<ShortcutGateState>()
        .is_none_or(|gate| gate.allows(role));
    if !allowed {
        tracing::debug!(role = role.as_str(), "shortcut gated during onboarding");
    }
    allowed
}

/// The run that must be cancelled when the gate becomes `gate`: the active run's role, when
/// the new gate no longer allows it. See plan `onboarding-shortcut-gate` for why the run is
/// cancelled rather than left to finish.
pub fn run_to_cancel(gate: &ShortcutGate, active_run: Option<HotkeyRole>) -> Option<HotkeyRole> {
    active_run.filter(|role| !gate.allows(*role))
}
